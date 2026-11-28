import { createLifetime } from '../../ui/browser/lifetime';
import type { AppSession, AppView, AssistantCommand, AssistantView } from './app-contracts';

export function mountAssistantComposer(
  canvas: HTMLCanvasElement,
  form: HTMLFormElement,
  activity?: () => void,
) {
  const lifetime = createLifetime();
  const parent = form.parentElement!;
  const next = form.nextSibling;
  const portable = window.matchMedia('(pointer: coarse) and (max-width: 640px)');
  const input = form.querySelector<HTMLInputElement>('#assistant-message')!;
  const local = form.querySelector<HTMLInputElement>('input[value="guide"]')!;
  const online = form.querySelector<HTMLInputElement>('input[value="online"]')!;
  const onlineLabel = form.querySelector<HTMLElement>('[data-online-label]')!;
  const guide = form.querySelector<HTMLElement>('#assistant-guide')!;
  const log = form.querySelector<HTMLElement>('#assistant-log')!;
  const prompts = form.querySelector<HTMLElement>('[data-prompts]')!;
  const history = form.querySelector<HTMLElement>('[data-history]')!;
  const live = form.querySelector<HTMLElement>('[role="status"]')!;
  const button = (action: string) =>
    form.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  const guideButton = button('guide'),
    logButton = button('log'),
    stop = button('stop'),
    send = button('send');
  let session: AppSession | undefined;
  let renderedPrompts: AssistantView['prompts'] | undefined;
  let renderedMessages: AssistantView['messages'] | undefined;
  let announcement = -1;
  let composing = false;
  let geometry = '';
  let pixelWidth = canvas.clientWidth,
    pixelHeight = canvas.clientHeight;

  const relocate = () => {
    const anchor =
      canvas.closest('#machine')?.querySelector('#monitor-controls') ??
      canvas.closest('.canvas-stage')?.nextElementSibling;
    if (portable.matches && anchor && anchor !== form) anchor.before(form);
    else if (!portable.matches && form.parentElement !== parent) parent.insertBefore(form, next);
    form.toggleAttribute('data-portable', portable.matches);
  };
  const closeLog = () => {
    log.hidden = true;
    logButton.setAttribute('aria-expanded', 'false');
  };
  const refresh = () => {
    const view = session?.assistantView?.();
    if (!view || form.hidden) return;
    if (!composing && input.value !== view.draft) input.value = view.draft;
    const destination = view.mode === 'guide' ? local : online;
    if (!destination.checked) destination.checked = true;
    const service = view.onlineHost ? `Online · ${view.onlineHost}` : 'Online';
    if (onlineLabel.textContent !== service) onlineLabel.textContent = service;
    if (online.disabled !== !view.onlineHost) online.disabled = !view.onlineHost;
    if (send.hidden !== view.canStop) send.hidden = view.canStop;
    if (stop.hidden === view.canStop) stop.hidden = !view.canStop;
    if (send.disabled !== !view.canSend) send.disabled = !view.canSend;
    if (guideButton.disabled !== !view.canGuide) guideButton.disabled = !view.canGuide;
    if (guide.hidden === view.guideOpen) {
      guide.hidden = !view.guideOpen;
      guideButton.setAttribute('aria-expanded', String(view.guideOpen));
    }
    if (view.prompts !== renderedPrompts) {
      renderedPrompts = view.prompts;
      prompts.replaceChildren(
        ...view.prompts.map((prompt) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.dataset.prompt = prompt.id;
          item.textContent = prompt.label;
          return item;
        }),
      );
    }
    if (!log.hidden && renderedMessages !== view.messages) {
      renderedMessages = view.messages;
      history.replaceChildren(
        ...view.messages.map((message) => {
          const row = document.createElement('p');
          const speaker = document.createElement('strong');
          speaker.textContent = `${message.role}: `;
          row.append(speaker, message.text);
          return row;
        }),
      );
    }
    if (view.announcement && view.announcement.id !== announcement) {
      announcement = view.announcement.id;
      live.textContent = view.announcement.text;
    }
  };
  const command = (intent: AssistantCommand) => {
    if (form.hidden || !session) return;
    activity?.();
    session.assistantCommand?.(intent);
    refresh();
  };
  const updateDraft = () =>
    command({
      kind: 'draft',
      text: input.value,
      selection: {
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length,
      },
    });
  const hide = () => {
    if (session?.closed) {
      session = undefined;
      renderedMessages = undefined;
      history.replaceChildren();
      live.textContent = '';
      input.value = '';
    }
    if (form.hidden) return;
    if (form.contains(document.activeElement)) canvas.focus({ preventScroll: true });
    form.hidden = true;
    composing = false;
    closeLog();
  };
  lifetime.defer(() => {
    hide();
    input.value = '';
    history.replaceChildren();
    live.textContent = '';
    if (form.parentElement !== parent) parent.insertBefore(form, next);
    form.removeAttribute('data-portable');
    form.removeAttribute('style');
  });
  try {
    relocate();
    lifetime.listen(portable, 'change', relocate);
    const observer = new ResizeObserver(([entry]) => {
      pixelWidth = entry.contentRect.width;
      pixelHeight = entry.contentRect.height;
    });
    lifetime.defer(() => observer.disconnect());
    observer.observe(canvas);
    lifetime.listen(input, 'compositionstart', () => {
      composing = true;
    });
    lifetime.listen(input, 'compositionend', () => {
      composing = false;
      updateDraft();
    });
    lifetime.listen(input, 'input', updateDraft);
    lifetime.listen(input, 'select', updateDraft);
    lifetime.listen(form, 'submit', (event) => {
      event.preventDefault();
      if (!composing) command({ kind: 'send' });
    });
    lifetime.listen(local, 'change', () => command({ kind: 'mode', mode: 'guide' }));
    lifetime.listen(online, 'change', () => command({ kind: 'mode', mode: 'online' }));
    lifetime.listen(form, 'click', (event) => {
      const target =
        event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!target || target.disabled) return;
      if (target.dataset.prompt) {
        command({ kind: 'prompt', id: target.dataset.prompt });
        guideButton.focus();
      } else if (target === guideButton) {
        closeLog();
        command({ kind: 'toggle-guide' });
        if (!guide.hidden) prompts.querySelector('button')?.focus();
      } else if (target === logButton) {
        if (!guide.hidden) command({ kind: 'toggle-guide' });
        log.hidden = !log.hidden;
        logButton.setAttribute('aria-expanded', String(!log.hidden));
        refresh();
        if (!log.hidden) history.focus();
      } else if (target === stop) {
        command({ kind: 'stop' });
        input.focus();
      } else if (target.dataset.action === 'connection') command({ kind: 'connection' });
    });
    lifetime.listen(form, 'keydown', (event) => {
      if (event.key !== 'Escape' || composing || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (!log.hidden) {
        closeLog();
        logButton.focus();
      } else if (!guide.hidden) {
        command({ kind: 'toggle-guide' });
        guideButton.focus();
      } else canvas.focus({ preventScroll: true });
    });
    return {
      sync(current?: AppSession, client?: AppView['client']) {
        if (!current || !client || current.closed) {
          hide();
          return;
        }
        if (session !== current) {
          session = current;
          announcement = -1;
          renderedMessages = undefined;
          history.replaceChildren();
          live.textContent = '';
          closeLog();
        }
        const left = (client.x / canvas.width) * 100,
          top = ((client.y + client.h - 55) / canvas.height) * 100;
        const scaleX = pixelWidth / canvas.width,
          scaleY = pixelHeight / canvas.height;
        const key = `${left},${top},${client.w},${client.h},${scaleX},${scaleY}`;
        if (geometry !== key) {
          geometry = key;
          Object.assign(form.style, {
            left: `${left}%`,
            top: `${top}%`,
            width: `${client.w}px`,
            transform: `scale(${scaleX},${scaleY})`,
          });
          form.style.setProperty('--assistant-panel-height', `${Math.max(40, client.h - 55)}px`);
        }
        if (form.hidden) form.hidden = false;
        refresh();
      },
      hide,
      dispose: lifetime.dispose,
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
