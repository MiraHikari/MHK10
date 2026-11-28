import { defineCanvasApp } from '../../os/host/app-session';
import { appMetadata } from '../../../data/app-catalog';

import { type TextFieldState } from '../../ui/canvas/widgets';
import { AiReplyError, validateAiConfig, type AiConfig } from '../../os/ai/ai-connection';

interface State {
  endpoint: TextFieldState;
  model: TextFieldState;
  apiKey: TextFieldState;
  transport: AiConfig['transport'];
  rememberKey: boolean;
  notice: string;
  alive: boolean;
  revision: number;
  unsubscribe: () => void;
  request: AbortController | null;
  timer: ReturnType<typeof setTimeout> | null;
}

function cancelTest(s: State): void {
  if (s.timer !== null) clearTimeout(s.timer);
  s.timer = null;
  const request = s.request;
  s.request = null;
  request?.abort();
}

export const connectionApp = defineCanvasApp<State>({
  ...appMetadata('connection'),
  create: (env) => {
    const config = env.ai.getConfig();
    const state: State = {
      endpoint: { text: config.endpoint, caret: config.endpoint.length },
      model: { text: config.model, caret: config.model.length },
      apiKey: { text: '', caret: 0 },
      transport: config.transport,
      rememberKey: config.rememberKey,
      notice: '',
      alive: true,
      revision: 0,
      unsubscribe: () => {},
      request: null,
      timer: null,
    };
    state.unsubscribe = env.ai.onChange(() => {
      state.revision++;
      const testing = !!state.request;
      cancelTest(state);
      state.notice = testing
        ? 'Connection changed. Test cancelled.'
        : env.ai.getConfig().enabled
          ? 'Connection settings updated.'
          : 'Offline mode. No test is running.';
      env.invalidate();
    });
    return state;
  },
  dispose(s) {
    if (!s.alive) return;
    s.alive = false;
    cancelTest(s);
    s.apiKey = { text: '', caret: 0 };
    s.unsubscribe();
  },
  status: (s, env) =>
    s.notice ||
    (env.ai.getConfig().enabled ? 'Online service enabled.' : 'Offline assistant is available.'),
  draw(s, v, env) {
    const c = v.client;
    const before = {
      endpoint: s.endpoint.text,
      model: s.model.text,
      apiKey: s.apiKey.text,
      transport: s.transport,
      rememberKey: s.rememberKey,
    };
    v.draw.text('AI Connection', c.x + 12, c.y + 9, { font: 'bold' });
    if (
      v.widgets.button(
        c.x + c.w - 130,
        c.y + 5,
        118,
        21,
        s.request ? 'Stop test' : 'Test connection',
      )
    ) {
      const config = env.ai.getConfig();
      if (s.request) {
        cancelTest(s);
        s.notice = 'Connection test stopped.';
      } else if (!config.enabled) {
        s.notice = 'Enable this connection before testing.';
      } else if (
        s.endpoint.text.trim() !== config.endpoint ||
        s.model.text.trim() !== config.model ||
        s.transport !== config.transport ||
        s.rememberKey !== config.rememberKey ||
        s.apiKey.text
      ) {
        s.notice = 'Enable the edited settings before testing.';
      } else {
        const controller = new AbortController();
        s.request = controller;
        s.notice = 'Testing connection...';
        const timeout = setTimeout(() => {
          if (s.request !== controller) return;
          cancelTest(s);
          s.notice = 'Connection test timed out. Check the service and try again.';
          env.invalidate();
        }, 20000);
        s.timer = timeout;
        void env.ai
          .reply(
            [
              { role: 'system', content: 'This is a connection test. Reply with OK only.' },
              { role: 'user', content: 'Connection test.' },
            ],
            controller.signal,
          )
          .then(() => {
            if (s.request !== controller) return;
            s.notice = `Connection verified. Model: ${config.model || 'relay default'}.`;
          })
          .catch((error: unknown) => {
            if (s.request !== controller) return;
            s.notice =
              error instanceof AiReplyError
                ? error.message
                : 'Connection test failed. Check the service URL and browser CORS permission.';
          })
          .finally(() => {
            clearTimeout(timeout);
            if (s.timer === timeout) s.timer = null;
            if (s.request === controller) {
              s.request = null;
              env.invalidate();
            }
          });
      }
    }
    if (v.widgets.radio(c.x + 12, c.y + 28, 'OpenAI compatible', s.transport === 'compatible'))
      s.transport = 'compatible';
    if (v.widgets.radio(c.x + 220, c.y + 28, 'Legacy relay', s.transport === 'relay'))
      s.transport = 'relay';
    v.draw.text(s.transport === 'compatible' ? 'Base URL:' : 'Relay URL:', c.x + 12, c.y + 56);
    s.endpoint = v.widgets.textField(
      'ai-endpoint',
      c.x + 100,
      c.y + 49,
      c.w - 112,
      21,
      s.endpoint,
      {
        max: 240,
        focused: v.focused,
      },
    );
    v.draw.text('Model ID:', c.x + 12, c.y + 84);
    s.model = v.widgets.textField('ai-model', c.x + 100, c.y + 77, c.w - 112, 21, s.model, {
      max: 200,
      focused: v.focused,
    });
    v.draw.text('API key:', c.x + 12, c.y + 112);
    s.apiKey = v.widgets.textField('ai-key', c.x + 100, c.y + 105, c.w - 112, 21, s.apiKey, {
      max: 512,
      focused: v.focused,
      password: true,
    });
    if (v.widgets.check(c.x + 12, c.y + 137, 'Remember API key', s.rememberKey))
      s.rememberKey = !s.rememberKey;
    if (
      before.endpoint !== s.endpoint.text ||
      before.model !== s.model.text ||
      before.apiKey !== s.apiKey.text ||
      before.transport !== s.transport ||
      before.rememberKey !== s.rememberKey
    ) {
      s.revision++;
      if (s.request) cancelTest(s);
      s.notice = 'Connection settings changed. Enable them before testing.';
    }
    if (v.widgets.button(c.x + c.w - 88, c.y + 131, 76, 21, 'Clear key')) {
      s.apiKey = { text: '', caret: 0 };
      s.rememberKey = false;
      const saved = env.ai.saveConfig(
        { ...env.ai.getConfig(), enabled: false, rememberKey: false },
        '',
      );
      s.notice = saved
        ? 'API key removed. Connection is offline.'
        : 'Session key removed; saved settings could not be updated.';
    }
    v.draw.text(
      env.ai.hasApiKey() && !s.apiKey.text
        ? s.endpoint.text.trim() === env.ai.getConfig().endpoint
          ? 'Existing key retained; enter a replacement to change it.'
          : 'Changing the service clears the retained key.'
        : s.rememberKey
          ? 'The key will be saved with connection settings.'
          : 'The key is kept for this session only.',
      c.x + 12,
      c.y + 160,
    );
    if (v.widgets.button(c.x + 12, c.y + 176, 104, 23, 'Work Offline')) {
      s.notice = env.ai.saveConfig({ ...env.ai.getConfig(), enabled: false })
        ? 'Offline mode saved.'
        : 'Offline for this session; storage unavailable.';
    }
    if (v.widgets.button(c.x + c.w - 190, c.y + 176, 94, 23, 'Enable')) {
      try {
        const config = validateAiConfig({
          endpoint: s.endpoint.text,
          model: s.model.text,
          transport: s.transport,
          rememberKey: s.rememberKey,
          enabled: true,
        });
        const replacement = s.apiKey.text || undefined,
          revision = s.revision;
        const removingSavedKey = env.ai.getConfig().rememberKey && !config.rememberKey;
        env.msg({
          title: 'Connect MHK10 Assistant',
          icon: 'question',
          lines: [
            'Send new online messages and the public profile to:',
            new URL(config.endpoint).host,
            'Offline conversations and your documents are excluded.',
          ],
          buttons: ['Enable', 'Cancel'],
          def: 1,
          onBtn: (i) => {
            if (!s.alive || revision !== s.revision) return;
            if (i !== 0) {
              s.notice = 'Connection enablement cancelled.';
              env.invalidate();
              return;
            }
            try {
              const saved = env.ai.saveConfig(config, replacement);
              s.endpoint = { text: config.endpoint, caret: config.endpoint.length };
              s.model = { text: config.model, caret: config.model.length };
              s.apiKey = { text: '', caret: 0 };
              s.notice = saved
                ? 'Connection enabled.'
                : removingSavedKey
                  ? 'Saved key could not be removed. Session updated.'
                  : 'Session only; storage unavailable.';
            } catch {
              s.notice = 'Check the model ID and API key fields.';
            }
            env.invalidate();
          },
        });
      } catch {
        s.notice = s.model.text.trim()
          ? 'Use HTTPS or localhost; keep credentials in the key field.'
          : 'Enter a service address and model ID.';
      }
    }
    if (v.widgets.button(c.x + c.w - 88, c.y + 176, 76, 23, 'Close')) env.close(v.win.id);
  },
});
