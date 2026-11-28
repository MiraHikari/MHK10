export interface MenuItem {
  separator?: boolean;
  disabled?: boolean;
  command?: string;
  mnemonic?: string;
  submenu?: boolean;
}

export type MenuNavigation =
  | { type: 'highlight'; index: number }
  | { type: 'close' }
  | { type: 'choose'; command: string }
  | { type: 'submenu'; index: number }
  | { type: 'ignore' };

function enabledIndices(items: readonly MenuItem[]): number[] {
  return items.flatMap((item, index) =>
    !item.separator && !item.disabled && (item.command || item.submenu) ? [index] : [],
  );
}

/** One keyboard decision for system menus, Start, context menus and canvas menu bars. */
export function navigateMenu(
  items: readonly MenuItem[],
  selected: number,
  key: string,
): MenuNavigation {
  if (key === 'Escape' || key === 'Alt') return { type: 'close' };
  const enabled = enabledIndices(items);
  if (key === 'Home' || key === 'End' || key === 'ArrowDown' || key === 'ArrowUp') {
    if (!enabled.length) return { type: 'highlight', index: -1 };
    if (key === 'Home') return { type: 'highlight', index: enabled[0] };
    if (key === 'End') return { type: 'highlight', index: enabled.at(-1) ?? -1 };
    const direction = key === 'ArrowDown' ? 1 : -1;
    let index = selected < 0 || selected >= items.length ? (direction === 1 ? -1 : 0) : selected;
    for (let tries = 0; tries < items.length; tries++) {
      index = (index + direction + items.length) % items.length;
      if (enabled.includes(index)) return { type: 'highlight', index };
    }
    return { type: 'highlight', index: -1 };
  }
  if (key === 'Enter') {
    const item = items[selected];
    if (!item || item.separator || item.disabled) return { type: 'ignore' };
    if (item.submenu) return { type: 'submenu', index: selected };
    if (!item.command) return { type: 'ignore' };
    return { type: 'choose', command: item.command };
  }
  if (key.length === 1 && key !== ' ') {
    const mnemonic = key.toLowerCase();
    const matches = enabled.filter((index) => items[index].mnemonic?.toLowerCase() === mnemonic);
    if (matches.length > 1) {
      const next = (matches.indexOf(selected) + 1) % matches.length;
      return { type: 'highlight', index: matches[next] };
    }
    const index = matches[0];
    const item = items[index];
    if (item?.submenu) return { type: 'submenu', index };
    if (item?.command) return { type: 'choose', command: item.command };
  }
  return { type: 'ignore' };
}
