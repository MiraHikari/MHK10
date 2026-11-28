import { createLifetime } from './lifetime';

let sequence = 0;

/** Own enhanced selects, their popups and restoration; callers own root observation. */
export function mountBrowserComboboxes(
  root: Document | HTMLElement,
  interaction: {
    isDisabled(element: Element): boolean;
    isInteractive(element: Element): boolean;
  },
): { refresh(): void; close(): void; dispose(): void } {
  const doc = root.ownerDocument ?? (root as Document);
  const view = doc.defaultView!;
  const { isDisabled, isInteractive } = interaction;
  const selects = new Map<HTMLSelectElement, { refresh(): void; dispose(): void }>();
  let closePopup: (() => void) | undefined;
  let disposed = false;
  function enhance(select: HTMLSelectElement) {
    if (
      selects.has(select) ||
      select.multiple ||
      select.hidden ||
      select.getAttribute('aria-hidden') === 'true'
    )
      return;
    const local = createLifetime();
    const button = doc.createElement('button');
    const label = doc.createElement('span');
    const arrow = doc.createElement('span');
    const id = `mhk-select-${++sequence}`;
    const originalTabIndex = select.tabIndex;
    const originalAria = select.getAttribute('aria-hidden');
    const labels = Array.from(select.labels ?? []);
    const associated = labels.map((item) => ({ item, htmlFor: item.getAttribute('for') }));
    let popup: HTMLUListElement | undefined;
    let optionSignature = '';
    const disabled = (option: HTMLOptionElement) =>
      option.disabled ||
      (option.parentElement?.tagName === 'OPTGROUP' &&
        (option.parentElement as HTMLOptGroupElement).disabled);
    const options = () => Array.from(select.options);
    function refresh() {
      const signature = JSON.stringify(
        options().map((option) => [option.value, option.label, disabled(option)]),
      );
      if (signature !== optionSignature) {
        if (popup) close();
        optionSignature = signature;
      }
      const option = select.selectedOptions[0];
      const value = option?.label ?? '';
      if (label.textContent !== value) label.textContent = value;
      const controlDisabled = isDisabled(select);
      if (button.disabled !== controlDisabled) button.disabled = controlDisabled;
      if (button.hidden !== select.hidden) button.hidden = select.hidden;
      if (select.validity.valid) button.removeAttribute('aria-invalid');
      // The adapter owns aria-hidden on the source; its visible sibling retains ancestor semantics.
      if (popup && !isInteractive(button)) close();
    }
    function close(focus = false) {
      popup?.remove();
      popup = undefined;
      button.setAttribute('aria-expanded', 'false');
      button.removeAttribute('aria-activedescendant');
      if (closePopup === close) closePopup = undefined;
      if (focus && button.isConnected) button.focus({ preventScroll: true });
    }
    local.defer(() => {
      close();
      button.remove();
      select.classList.remove('hybrid-select-native');
      select.tabIndex = originalTabIndex;
      if (originalAria === null) select.removeAttribute('aria-hidden');
      else select.setAttribute('aria-hidden', originalAria);
      associated.forEach(({ item, htmlFor }) => {
        if (htmlFor === null) item.removeAttribute('for');
        else item.htmlFor = htmlFor;
      });
    });
    selects.set(select, { refresh, dispose: local.dispose });
    try {
      const labelText = labels
        .map((item) => {
          const copy = item.cloneNode(true) as HTMLElement;
          copy
            .querySelectorAll('select,button,input,textarea')
            .forEach((control) => control.remove());
          return copy.textContent?.trim() ?? '';
        })
        .join(' ');
      button.type = 'button';
      button.id = `${id}-control`;
      button.className = 'hybrid-combobox';
      button.setAttribute('role', 'combobox');
      button.setAttribute('aria-haspopup', 'listbox');
      button.setAttribute('aria-controls', id);
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute(
        'aria-label',
        select.getAttribute('aria-label') ?? (labelText || select.name || 'Choose an option'),
      );
      if (select.hasAttribute('aria-labelledby'))
        button.setAttribute('aria-labelledby', select.getAttribute('aria-labelledby')!);
      if (select.hasAttribute('aria-describedby'))
        button.setAttribute('aria-describedby', select.getAttribute('aria-describedby')!);
      button.dataset.selectId = select.id;
      button.title = select.title;
      label.className = 'hybrid-combobox-label';
      arrow.className = 'hybrid-combobox-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      button.append(label, arrow);
      const width = Math.round(select.getBoundingClientRect().width);
      if (width > 30) button.style.width = `${width}px`;
      select.insertAdjacentElement('afterend', button);
      select.classList.add('hybrid-select-native');
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');
      associated.forEach(({ item }) => {
        item.htmlFor = button.id;
      });
      let active = select.selectedIndex;
      let query = '',
        typedAt = 0;
      function move(index: number) {
        const choices = options();
        active = Math.max(0, Math.min(choices.length - 1, index));
        popup?.querySelectorAll<HTMLElement>('[role="option"]').forEach((item, i) => {
          item.dataset.active = String(i === active);
        });
        button.setAttribute('aria-activedescendant', `${id}-${active}`);
        const item = popup?.children[active] as HTMLElement | undefined;
        // 浏览器原生滚动到可视区（尊重 scroll-padding / 边框），不再手工
        // 读 offsetTop/offsetHeight/clientHeight 维护滚动盒子。
        item?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      function next(direction: number) {
        const choices = options();
        for (
          let index = active + direction;
          index >= 0 && index < choices.length;
          index += direction
        ) {
          if (!disabled(choices[index])) {
            move(index);
            break;
          }
        }
      }
      function choose(index: number) {
        refresh();
        const option = options()[index];
        if (!popup || !option || disabled(option) || !isInteractive(button)) return;
        select.selectedIndex = index;
        refresh();
        close(true);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function open() {
        refresh();
        if (!isInteractive(button) || !select.options.length) return;
        closePopup?.();
        closePopup = close;
        popup = doc.createElement('ul');
        popup.id = id;
        popup.className = 'hybrid-popup';
        popup.setAttribute('role', 'listbox');
        popup.setAttribute('aria-label', button.getAttribute('aria-label') ?? 'Options');
        // A body-level popup inherits the initiating control's surface palette.
        const palette = view.getComputedStyle(button);
        for (const property of [
          '--face',
          '--ink',
          '--paper',
          '--accent',
          '--accent-text',
          '--muted',
          '--hi',
          '--shadow',
          '--line',
        ]) {
          popup.style.setProperty(property, palette.getPropertyValue(property));
        }
        options().forEach((option, index) => {
          const item = doc.createElement('li');
          item.id = `${id}-${index}`;
          item.textContent = option.label;
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', String(option.selected));
          item.setAttribute('aria-disabled', String(disabled(option)));
          item.dataset.index = String(index);
          popup!.append(item);
        });
        (select.closest('dialog[open]') ?? doc.body).append(popup);
        const rect = button.getBoundingClientRect();
        const popupWidth = Math.max(Math.round(rect.width), Math.min(280, popup.scrollWidth + 8));
        const below = view.innerHeight - rect.bottom - 4,
          above = rect.top - 4;
        const height = Math.min(
          options().length * 18 + 8,
          224,
          Math.max(40, below >= above ? below : above),
        );
        Object.assign(popup.style, {
          left: `${Math.max(2, Math.min(Math.round(rect.left), view.innerWidth - popupWidth - 2))}px`,
          top: `${Math.round(below >= height ? rect.bottom : Math.max(2, rect.top - height))}px`,
          width: `${Math.min(view.innerWidth - 4, popupWidth)}px`,
          maxHeight: `${Math.floor(height)}px`,
        });
        button.setAttribute('aria-expanded', 'true');
        active =
          select.selectedIndex < 0
            ? options().findIndex((option) => !disabled(option))
            : select.selectedIndex;
        move(active);
      }
      local.listen(button, 'click', () => {
        if (popup) close();
        else open();
      });
      local.listen(button, 'keydown', (event) => {
        if (event.isComposing || !isInteractive(button)) return;
        if (event.key === 'Escape') {
          if (popup) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          }
          return;
        }
        if (event.key === 'Tab') {
          close();
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (popup) choose(active);
          else open();
          return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
          event.preventDefault();
          if (!popup) open();
          if (event.key === 'Home') {
            active = -1;
            next(1);
          } else if (event.key === 'End') {
            active = options().length;
            next(-1);
          } else {
            const direction = event.key === 'ArrowUp' || event.key === 'PageUp' ? -1 : 1;
            for (let i = 0; i < (event.key.startsWith('Page') ? 6 : 1); i++) next(direction);
          }
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          if (!popup) open();
          const now = Date.now();
          query = (now - typedAt > 700 ? '' : query) + event.key.toLocaleLowerCase();
          typedAt = now;
          const index = options().findIndex(
            (option) => !disabled(option) && option.label.toLocaleLowerCase().startsWith(query),
          );
          if (index >= 0) move(index);
        }
      });
      local.listen(
        doc,
        'pointerdown',
        (event) => {
          if (!popup) return;
          const target = event.target as Node;
          if (popup.contains(target)) event.preventDefault();
          else if (!button.contains(target)) close();
        },
        { capture: true },
      );
      local.listen(doc, 'pointermove', (event) => {
        if (!popup) return;
        const item = (event.target as Element).closest<HTMLElement>('[role="option"]');
        if (item && popup.contains(item) && item.getAttribute('aria-disabled') !== 'true')
          move(Number(item.dataset.index));
      });
      local.listen(doc, 'click', (event) => {
        if (!popup) return;
        const item = (event.target as Element).closest<HTMLElement>('[role="option"]');
        if (item && popup.contains(item)) choose(Number(item.dataset.index));
      });
      local.listen(select, 'change', refresh);
      if (select.form) {
        // 表单重置发生在 `reset` 事件的默认动作里，而微任务在该动作之前
        // 执行：queueMicrotask 会读回旧值，标签就停在重置前的选项上。
        // 放到下一个任务再刷新，让原生的重置先落地。
        let resetTimer: ReturnType<typeof setTimeout> | undefined;
        local.defer(() => {
          if (resetTimer !== undefined) clearTimeout(resetTimer);
        });
        local.listen(select.form, 'reset', () => {
          if (resetTimer !== undefined) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            resetTimer = undefined;
            if (local.disposed) return;
            close();
            refresh();
          }, 0);
        });
      }
      local.listen(select, 'invalid', (event) => {
        event.preventDefault();
        button.setAttribute('aria-invalid', 'true');
        button.focus();
      });
      local.listen(view, 'resize', () => close());
      local.listen(
        doc,
        'scroll',
        (event) => {
          if (
            popup &&
            event.target !== popup &&
            !(event.target instanceof view.Node && popup.contains(event.target))
          )
            close();
        },
        { capture: true, passive: true },
      );
      refresh();
    } catch (error) {
      local.dispose();
      selects.delete(select);
      throw error;
    }
  }
  function reconcile() {
    selects.forEach((control, select) => {
      if (!root.contains(select)) {
        control.dispose();
        selects.delete(select);
      } else control.refresh();
    });
    root.querySelectorAll<HTMLSelectElement>('select').forEach(enhance);
  }
  return {
    refresh() {
      if (!disposed) reconcile();
    },
    close() {
      closePopup?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      selects.forEach((control) => control.dispose());
      selects.clear();
      closePopup?.();
    },
  };
}
