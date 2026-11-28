import { APP_CATALOG, appMetadata } from '../../../data/app-catalog';
import { AiReplyError, type AiMessage } from '../../os/ai/ai-connection';
import {
  ASSISTANT_CONTEXT,
  ASSISTANT_PROMPTS,
  offlineReply,
  suggestedApp,
} from '../../os/ai/assistant-replies';
import type { SandboxFile } from '../../os/files/filesystem';
import type { AppServices, AssistantCommand, AssistantView } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';
import { HELP_TOPICS } from '../../ui/help';
import { drawChatHistory, type ChatHistory } from './chat-history';

type Message = AssistantView['messages'][number];
interface Draft {
  text: string;
  start: number;
  end: number;
}
interface OnlineRequest {
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  text: string;
}
interface State {
  log: Message[];
  snapshot: readonly Message[] | null;
  draft: Draft;
  pasting: boolean;
  pendingApp: { id: string } | null;
  clearing: boolean;
  history: ChatHistory;
  mode: AssistantView['mode'];
  onlineHost: string | null;
  guideOpen: boolean;
  retry: string | null;
  request: OnlineRequest | null;
  onlineMessages: AiMessage[];
  notice: string;
  announcement: AssistantView['announcement'];
  unsubscribe: () => void;
  alive: boolean;
  revision: number;
}

const EMPTY_DRAFT: Draft = { text: '', start: 0, end: 0 };
const MAX_DRAFT = 1000;

function messages(state: State): readonly Message[] {
  return (state.snapshot ??= Object.freeze([...state.log]));
}

function append(state: State, role: Message['role'], text: string): void {
  state.log.push(Object.freeze({ role, text }));
  state.snapshot = null;
}

function transcript(state: State): string {
  const committed = state.log.map(({ role, text }) => `${role}: ${text}`);
  if (state.request?.text) committed.push(`Online AI: ${state.request.text}`);
  return committed.join('\n\n');
}

function status(state: State): string {
  if (state.clearing) return 'Awaiting confirmation to clear the conversation...';
  if (state.pendingApp) return 'Awaiting application confirmation...';
  if (state.request)
    return state.request.text
      ? 'Online AI is responding...'
      : 'Connecting to the online service...';
  if (state.pasting) return 'Reading clipboard...';
  return state.notice || (state.mode === 'online' ? 'Online | Ready' : 'Desktop guide | Ready');
}

function announce(state: State, text: string): void {
  state.announcement = { id: (state.announcement?.id ?? 0) + 1, text };
}

function announceReply(state: State, role: Exclude<Message['role'], 'You'>, text: string): void {
  announce(
    state,
    text.length > 320
      ? `${role} replied. Read the complete reply in the conversation history.`
      : `${role}: ${text}`,
  );
}

function onlineHost(env: AppServices): string | null {
  const config = env.ai.getConfig();
  return config.enabled ? new URL(config.endpoint).host : null;
}

function canAsk(state: State): boolean {
  return !state.pendingApp && !state.clearing && !state.request && !state.pasting;
}

function canRetry(state: State): boolean {
  return !!state.retry && state.mode === 'online' && canAsk(state);
}

function releaseRequest(state: State): OnlineRequest | null {
  const request = state.request;
  if (!request) return null;
  state.request = null;
  clearTimeout(request.timer);
  return request;
}

function abortRequest(state: State, marker?: string): boolean {
  const request = releaseRequest(state);
  if (!request) return false;
  request.controller.abort();
  if (marker) append(state, 'Online AI', request.text ? `${request.text}\n${marker}` : marker);
  return true;
}

function startOnlineReply(state: State, message: string, env: AppServices): void {
  const controller = new AbortController();
  const fail = (notice: string) => {
    if (state.request !== request) return;
    releaseRequest(state);
    if (request.text) append(state, 'Online AI', `${request.text}\n[Response interrupted.]`);
    const { stage, owner } = env.story.get();
    append(
      state,
      'Assistant',
      `Online service unavailable. Offline reply: ${offlineReply(message, stage, owner)}`,
    );
    state.notice = notice;
    announce(state, `${notice} An offline reply is in the conversation history.`);
    env.play('ding');
    env.invalidate();
  };
  const request: OnlineRequest = {
    controller,
    timer: setTimeout(() => {
      if (state.request !== request) return;
      controller.abort();
      fail('Connection timed out. Offline assistant is available.');
    }, 20000),
    text: '',
  };
  state.request = request;
  state.retry = message;
  const context: AiMessage[] = [
    ...state.onlineMessages.slice(-10),
    { role: 'user', content: message },
  ];
  void env.ai
    .reply(
      [{ role: 'system', content: ASSISTANT_CONTEXT }, ...context],
      controller.signal,
      (text) => {
        if (state.request !== request || !text) return;
        request.text = text;
        env.invalidate();
      },
    )
    .then((reply) => {
      if (state.request !== request) return;
      releaseRequest(state);
      state.onlineMessages = [...context, { role: 'assistant', content: reply }];
      append(state, 'Online AI', reply);
      state.retry = null;
      state.notice = 'Reply received from online AI.';
      announceReply(state, 'Online AI', reply);
      env.play('ding');
      env.invalidate();
    })
    .catch((error: unknown) => {
      fail(
        error instanceof AiReplyError
          ? error.message
          : 'Connection failed. Offline assistant is available.',
      );
    });
}

function sendMessage(state: State, message: string, env: AppServices, guide = false): void {
  append(state, 'You', message);
  const id = suggestedApp(message);
  if (id) {
    const pending = { id };
    const label = APP_CATALOG.find((entry) => entry.id === id)?.name ?? 'About';
    state.pendingApp = pending;
    const complete = (index?: number) => {
      if (!state.alive || state.pendingApp !== pending) return;
      state.pendingApp = null;
      state.notice =
        index !== 0
          ? `Opening ${label} cancelled.`
          : env.open(pending.id).accepted
            ? `Opening ${label}.`
            : `${label} could not be opened on this desktop.`;
      append(state, 'Assistant', state.notice);
      announceReply(state, 'Assistant', state.notice);
      env.invalidate();
    };
    env.msg({
      title: 'MHK10 Assistant',
      icon: 'question',
      lines: [`Open ${label} on this desktop?`],
      buttons: ['Open', 'Cancel'],
      def: 1,
      onBtn: complete,
      onDismiss: () => complete(),
    });
    return;
  }
  if (guide || state.mode === 'guide') {
    const { stage, owner } = env.story.get();
    const reply = offlineReply(message, stage, owner);
    append(state, 'Assistant', reply);
    state.notice = 'Desktop guide answered offline.';
    announceReply(state, 'Assistant', reply);
    return;
  }
  startOnlineReply(state, message, env);
}

function handleAssistantCommand(state: State, command: AssistantCommand, env: AppServices): void {
  switch (command.kind) {
    case 'draft': {
      // `selectionStart`/`End` are UTF-16 offsets; truncating by code point
      // would shift the caret after an emoji or any astral character.
      const text = command.text.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_DRAFT);
      const start = Math.min(text.length, command.selection?.start ?? text.length);
      const end = Math.min(text.length, command.selection?.end ?? start);
      if (text !== state.draft.text || start !== state.draft.start || end !== state.draft.end)
        state.draft = { text, start, end };
      break;
    }
    case 'mode':
      if (state.clearing || state.pendingApp || state.mode === command.mode) return;
      if (command.mode === 'online' && !state.onlineHost) return;
      state.mode = command.mode;
      if (abortRequest(state, '[Response stopped.]')) {
        state.notice = 'Request cancelled. Desktop guide is ready.';
        announce(state, state.notice);
      } else state.notice = '';
      break;
    case 'prompt': {
      const prompt = ASSISTANT_PROMPTS.find(({ id }) => id === command.id);
      if (!prompt || !canAsk(state)) return;
      state.guideOpen = false;
      sendMessage(state, prompt.message, env, true);
      break;
    }
    case 'send': {
      const message = state.draft.text.trim();
      if (!message || !canAsk(state)) return;
      state.draft = EMPTY_DRAFT;
      state.guideOpen = false;
      sendMessage(state, message, env);
      env.play('click');
      break;
    }
    case 'stop':
      if (state.clearing || !abortRequest(state, '[Response stopped.]')) return;
      state.notice = 'Request cancelled.';
      announce(state, state.notice);
      break;
    case 'retry':
      if (!state.retry || !canRetry(state)) return;
      state.guideOpen = false;
      startOnlineReply(state, state.retry, env);
      break;
    case 'toggle-guide':
      if (!canAsk(state) && !state.guideOpen) return;
      state.guideOpen = !state.guideOpen;
      break;
    case 'connection':
      state.guideOpen = false;
      env.open('connection');
      break;
  }
  env.invalidate();
}

export const chatApp = defineCanvasApp<State>({
  ...appMetadata('chat'),
  needsFrame: (state) => state.history.dragOffset !== null,
  checkpoint: () => true,
  status,
  assistantView: (state): AssistantView => ({
    draft: state.draft.text,
    mode: state.mode,
    onlineHost: state.onlineHost,
    guideOpen: state.guideOpen,
    canSend: canAsk(state) && !!state.draft.text.trim(),
    canStop: !!state.request && !state.clearing,
    canRetry: canRetry(state),
    canGuide: canAsk(state),
    status: status(state),
    announcement: state.announcement,
    messages: messages(state),
    prompts: ASSISTANT_PROMPTS,
  }),
  assistantCommand: handleAssistantCommand,

  menus: (state) => ({
    File: [
      { command: 'save', label: 'Save transcript', disabled: !state.log.length },
      { command: 'save-as', label: 'Save transcript as...', disabled: !state.log.length },
      { command: 'export', label: 'Export transcript...', disabled: !state.log.length },
      { command: 'connection', label: 'Connection...' },
      { command: 'clear', label: 'Clear conversation', disabled: !state.log.length },
      '-',
      { command: 'close', label: 'Exit' },
    ],
    Edit: [
      {
        command: 'paste',
        label: 'Paste into message',
        shortcut: 'Ctrl+V',
        disabled: state.pasting,
      },
      '-',
      {
        command: 'copy-latest',
        label: 'Copy latest reply',
        disabled: !state.request?.text && !state.log.some(({ role }) => role !== 'You'),
      },
      { command: 'copy-all', label: 'Copy transcript', disabled: !state.log.length },
      '-',
      { command: 'retry', label: 'Retry online question', disabled: !canRetry(state) },
    ],
    Help: [{ command: 'help', label: 'Conversation tips' }],
  }),

  create: (env) => {
    const state: State = {
      log: [],
      snapshot: null,
      draft: EMPTY_DRAFT,
      pasting: false,
      pendingApp: null,
      clearing: false,
      history: { offset: 0, count: 0, readingEarlier: false, dragOffset: null },
      mode: 'guide',
      onlineHost: onlineHost(env),
      guideOpen: false,
      retry: null,
      request: null,
      onlineMessages: [],
      notice: '',
      announcement: null,
      unsubscribe: () => {},
      alive: true,
      revision: 0,
    };
    state.unsubscribe = env.ai.onChange(() => {
      const interrupted = abortRequest(state, '[Response stopped.]');
      state.mode = 'guide';
      state.onlineHost = onlineHost(env);
      state.onlineMessages = [];
      state.retry = null;
      state.notice = state.onlineHost
        ? 'Connection updated. Choose Online to send there.'
        : 'Desktop guide | Ready';
      if (interrupted) announce(state, 'Connection changed. Online request cancelled.');
      env.invalidate();
    });
    return state;
  },
  dispose: (state) => {
    if (!state.alive) return;
    state.alive = false;
    abortRequest(state);
    state.unsubscribe();
  },

  draw(state, frame, env) {
    const command = frame.menuSel?.command;
    if (command === 'clear' && state.log.length && !state.clearing) {
      state.clearing = true;
      const complete = (index?: number) => {
        if (!state.alive || !state.clearing) return;
        state.clearing = false;
        if (index === 0) {
          state.revision++;
          state.pasting = false;
          state.pendingApp = null;
          abortRequest(state);
          state.log = [];
          state.snapshot = null;
          state.onlineMessages = [];
          state.retry = null;
          state.history = { offset: 0, count: 0, readingEarlier: false, dragOffset: null };
          state.notice = 'Conversation cleared.';
        } else state.notice = 'Clear conversation cancelled.';
        announce(state, state.notice);
        env.invalidate();
      };
      env.msg({
        title: 'Clear conversation?',
        icon: 'warn',
        lines: ['Clear this unsaved conversation?', 'Saved and exported copies are not affected.'],
        buttons: ['Clear', 'Cancel'],
        def: 1,
        onBtn: complete,
        onDismiss: () => complete(),
      });
    }
    if (command === 'connection' || command === 'retry')
      handleAssistantCommand(state, { kind: command }, env);
    if (command === 'help')
      env.msg({ title: HELP_TOPICS.chat.title, icon: 'info', lines: [...HELP_TOPICS.chat.lines] });

    drawChatHistory(frame, state.history, messages(state), state.request?.text ?? '');

    if (command === 'paste' && !state.pasting) {
      const requested = state.draft;
      const revision = state.revision;
      state.pasting = true;
      void env.clipboard.read().then((value) => {
        if (!state.alive || revision !== state.revision) return;
        state.pasting = false;
        if (state.draft !== requested)
          state.notice = 'Message changed while reading the clipboard. Paste again.';
        else if (!value) state.notice = 'Clipboard is empty.';
        else {
          const leading = requested.text.slice(0, requested.start),
            trailing = requested.text.slice(requested.end),
            room = MAX_DRAFT - Array.from(leading + trailing).length,
            printable = Array.from(value.replace(/[\r\n\t]+/g, ' ')).filter(
              (character) => character >= ' ',
            ),
            insertion = printable.slice(0, room).join(''),
            caret = leading.length + insertion.length;
          state.draft = { text: leading + insertion + trailing, start: caret, end: caret };
          state.notice =
            printable.length > room
              ? 'Pasted up to the 1,000-character message limit.'
              : 'Pasted into message. Press Enter to send.';
        }
        announce(state, state.notice);
        env.invalidate();
      });
    }
    if (command === 'copy-latest' || command === 'copy-all') {
      const text =
        command === 'copy-latest'
          ? state.request?.text || state.log.findLast(({ role }) => role !== 'You')?.text
          : transcript(state);
      if (text) {
        const revision = state.revision;
        void env.clipboard.write(text).then((ok) => {
          if (!state.alive || revision !== state.revision) return;
          state.notice = ok
            ? command === 'copy-latest'
              ? 'Reply copied. Paste into Notepad or another application.'
              : 'Transcript copied. Paste into Notepad or another application.'
            : 'Could not copy. Export the transcript to keep a copy.';
          announce(state, state.notice);
          env.invalidate();
        });
      }
    }
    if ((command === 'save' || command === 'save-as' || command === 'export') && state.log.length) {
      const content = transcript(state);
      if (command === 'export') {
        env.downloadText('Chat transcript.txt', content);
        state.notice = 'Transcript exported.';
      } else if (content.length > 20000) {
        state.notice =
          'Transcript exceeds 20,000 characters. Copy or export the complete conversation.';
      } else if (command === 'save') {
        const saved = env.files.saveGeneratedText(
          'assistant-chat',
          'Chat transcript.txt',
          content,
          'chat',
        );
        state.notice = saved.ok
          ? saved.persisted
            ? 'Transcript saved in My Documents.'
            : 'Transcript saved for this session. Export to keep.'
          : saved.error || 'Could not save transcript.';
      } else {
        const request = {
          name: 'Chat transcript.txt',
          folder: 'chat' as const,
          content,
          onSave: (file: SandboxFile, persisted: boolean) => {
            if (!state.alive) return;
            state.notice = `${file.name} saved${persisted ? ' locally.' : ' for this session.'}`;
            announce(state, state.notice);
            env.invalidate();
          },
        };
        if (env.openSaveDialog) env.openSaveDialog(frame, request, (value) => env.saveText(value));
        else {
          frame.input.consumePointer('wentDown');
          frame.input.consumePointer('wentUp');
          frame.input.consumeKey('Enter');
          void env.saveText(request).then((result) => {
            if (!state.alive) return;
            if (result.status === 'saved') request.onSave(result.file, result.persisted);
            else if (result.status === 'failed') {
              state.notice = result.error;
              announce(state, state.notice);
              env.invalidate();
            }
          });
        }
      }
      if (command !== 'save-as' || content.length > 20000) announce(state, state.notice);
    }
    if (command === 'close') env.close(frame.win.id);
  },
});
