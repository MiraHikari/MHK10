export interface MenuPresentation {
  checked?: boolean;
  radio?: boolean;
  default?: boolean;
  mnemonic?: string;
}
export interface MenuCommand extends MenuPresentation {
  command: string;
  label: string;
  disabled?: boolean;
  shortcut?: string;
}
export type MenuEntry = MenuCommand | '-';
export type AppMenus = Record<string, MenuEntry[]>;
export interface AppMenuSelection {
  menu: string;
  item: string;
  command?: string;
}

/** Formatting is a renderer concern; applications dispatch stable command identifiers. */
export function menuLabels(items: readonly MenuEntry[]): string[] {
  return items.map((item) =>
    item === '-'
      ? '-'
      : `${item.disabled ? '~' : ''}${item.label}${item.shortcut ? '\t' + item.shortcut : ''}`,
  );
}
