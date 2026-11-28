// Hierarchical Start navigation, independent of drawing and DOM input.
import { APP_CATALOG, catalogIcon, startMenuApps, type HostKind } from '../../../data/app-catalog';
import { navigateMenu } from '../../ui/canvas/menu-navigation';
import type { MenuPresentation } from '../../ui/canvas/menu-types';

export interface StartEntry extends MenuPresentation {
  label: string;
  icon?: string;
  command?: string;
  children?: StartEntry[];
  disabled?: boolean;
}
export class StartNavigation {
  selections = [0];
  private hoverKey = '';
  private hoverAt = 0;
  constructor(readonly entries: StartEntry[]) {
    this.reset();
  }
  reset(): void {
    this.selections = [
      this.entries.findIndex(
        (entry) =>
          entry.label !== '-' && !entry.disabled && (entry.command || entry.children?.length),
      ),
    ];
    this.hoverKey = '';
  }
  levels(): StartEntry[][] {
    const levels = [this.entries];
    for (let depth = 0; depth < this.selections.length - 1; depth++) {
      const next = levels[depth][this.selections[depth]]?.children;
      if (!next?.length) break;
      levels.push(next);
    }
    return levels;
  }
  select(depth: number, index: number): void {
    this.selections = [...this.selections.slice(0, depth), index];
  }
  activate(depth = this.selections.length - 1): string | undefined {
    const item = this.levels()[depth]?.[this.selections[depth]];
    if (!item || item.disabled || item.label === '-') return;
    if (item.children?.length) {
      this.selections = [
        ...this.selections.slice(0, depth + 1),
        item.children.findIndex(
          (entry) =>
            entry.label !== '-' && !entry.disabled && (entry.command || entry.children?.length),
        ),
      ];
      return;
    }
    return item.command;
  }
  hover(depth: number, index: number, time: number): void {
    const key = `${depth}:${index}`;
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this.hoverAt = time;
    }
    // Leave the active branch open while crossing into its submenu.
    if (time - this.hoverAt < 0.22) return;
    const item = this.levels()[depth]?.[index];
    if (!item || item.label === '-' || item.disabled) return;
    if (this.selections[depth] === index && this.selections.length > depth + 1) return;
    this.select(depth, index);
    if (item.children) this.activate(depth);
  }
  clearHover(): void {
    this.hoverKey = '';
  }
  key(key: string): string | undefined {
    const depth = this.selections.length - 1;
    if (key === 'Escape' || key === 'ArrowLeft') {
      if (depth) this.selections.pop();
      else if (key === 'Escape') return '$close';
      return;
    }
    if (key === 'Enter' || key === 'ArrowRight') {
      const item = this.levels()[depth][this.selections[depth]];
      return key === 'Enter' || item?.children ? this.activate(depth) : undefined;
    }
    const result = navigateMenu(
      this.levels()[depth].map((item) => ({
        separator: item.label === '-',
        disabled: item.disabled,
        command: item.command,
        submenu: !!item.children?.length,
        mnemonic: item.mnemonic ?? item.label.trim().charAt(0).toLowerCase(),
      })),
      this.selections[depth] ?? 0,
      key,
    );
    if (result.type === 'highlight') this.selections[depth] = result.index;
    else if (result.type === 'choose') return result.command;
    else if (result.type === 'submenu') {
      this.selections[depth] = result.index;
      return this.activate(depth);
    } else if (result.type === 'close') return '$close';
  }
}

const RUN_ALIASES: ReadonlyMap<string, string> = new Map(
  APP_CATALOG.flatMap((app) => (app.runAliases ?? []).map((alias) => [alias, app.id] as const)),
);

export function resolveRunCommand(
  value: string,
  apps: { id: string; title: string }[],
): string | undefined {
  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\.exe$/, '');
  const query = normalize(value);
  if (!query) return;
  const id = RUN_ALIASES.get(query) ?? query;
  return apps.find((app) => normalize(app.id) === id || normalize(app.title) === query)?.id;
}

/** Programs, documents, settings and the fixed desktop commands, with recent programs first. */
export function desktopStartEntries(
  host: HostKind,
  recentIds: readonly string[],
  embedFull = false,
): StartEntry[] {
  const recent = recentProgramEntries(
    recentIds,
    APP_CATALOG.map((app) => ({ id: app.id, title: app.name, icon: catalogIcon(app.id) })),
  );
  return [
    ...(recent.length
      ? [{ label: 'Recent', icon: 'i_folder', children: recent, mnemonic: 'e' }]
      : []),
    ...startMenuApps(host),
    { label: '-' },
    { label: 'Find...', icon: 'i_find', command: '$find' },
    { label: 'Help', icon: 'i_help', command: '$help' },
    { label: 'Run...', icon: 'i_find', command: '$run', mnemonic: 'r' },
    { label: '-' },
    // Fusion embed only: hand control back to the classic portfolio site.
    ...(embedFull ? [{ label: 'Classic Site', icon: 'i_computer', command: '$classic' }] : []),
    { label: 'Show Desktop', icon: 'i_computer', command: '$desktop', mnemonic: 'o' },
    { label: 'Shut Down...', icon: 'i_kill', command: '$shutdown', mnemonic: 'u' },
  ];
}

/** Start rows for recorded program ids, in order, skipping unknown or dialog ids. */
export function recentProgramEntries(
  ids: readonly string[],
  apps: readonly { id: string; title: string; icon?: string }[],
): StartEntry[] {
  const entries: StartEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id) || id.startsWith('$')) continue;
    const app = apps.find((item) => item.id === id);
    if (!app) continue;
    seen.add(id);
    entries.push({
      label: app.title,
      command: app.id,
      ...(app.icon ? { icon: app.icon } : {}),
    });
    if (entries.length >= 6) break;
  }
  return entries;
}
