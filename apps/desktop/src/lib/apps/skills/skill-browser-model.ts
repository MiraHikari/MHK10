export interface SkillRecord {
  name: string;
  category: string;
  note: string;
  years: number;
  level: number;
  keywords: string[];
}
export interface SkillCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  skills: readonly SkillRecord[];
}
export interface SkillTreeRow {
  id: string;
  kind: 'group' | 'skill';
  groupId: string;
  skill?: SkillRecord;
}
export interface SkillBrowserSnapshot {
  groups: readonly SkillCategory[];
  rows: readonly SkillTreeRow[];
  expanded: readonly string[];
  focused: string | undefined;
  selected: SkillRecord | undefined;
  query: string;
  matches: number;
  total: number;
}
export type SkillTreeKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

/** The technology tree owns filtering, keyboard focus and restoration as one session. */
export class SkillBrowser {
  private expanded = new Set<string>();
  private focused: string | undefined;
  private query = '';
  private beforeSearch: { expanded: Set<string>; focused: string | undefined } | undefined;
  constructor(private readonly categories: readonly SkillCategory[]) {
    const first = categories.find((category) => category.skills.length > 0);
    if (first) {
      this.expanded.add(first.id);
      this.focused = `skill:${first.skills[0].name}`;
    }
  }
  private groups(): SkillCategory[] {
    return this.categories
      .map((group) => {
        const categoryMatches = `${group.title} ${group.description}`
          .toLowerCase()
          .includes(this.query);
        return {
          ...group,
          skills: group.skills.filter(
            (skill) =>
              categoryMatches ||
              `${skill.name} ${skill.note} ${skill.keywords.join(' ')}`
                .toLowerCase()
                .includes(this.query),
          ),
        };
      })
      .filter((group) => group.skills.length > 0);
  }
  private rows(): SkillTreeRow[] {
    return this.groups().flatMap((group) => [
      { id: `group:${group.id}`, kind: 'group' as const, groupId: group.id },
      ...(this.expanded.has(group.id)
        ? group.skills.map((skill) => ({
            id: `skill:${skill.name}`,
            kind: 'skill' as const,
            groupId: group.id,
            skill,
          }))
        : []),
    ]);
  }
  snapshot(): SkillBrowserSnapshot {
    const groups = this.groups();
    const rows = this.rows();
    return {
      groups,
      rows,
      expanded: [...this.expanded],
      focused: this.focused,
      selected: rows.find((row) => row.id === this.focused)?.skill,
      query: this.query,
      matches: groups.reduce((sum, group) => sum + group.skills.length, 0),
      total: this.categories.reduce((sum, group) => sum + group.skills.length, 0),
    };
  }
  select(id: string): boolean {
    if (!this.rows().some((row) => row.id === id)) return false;
    this.focused = id;
    return true;
  }
  reveal(name: string): boolean {
    const group = this.categories.find((category) =>
      category.skills.some((skill) => skill.name === name),
    );
    if (!group) return false;
    this.search('');
    this.expanded.add(group.id);
    this.focused = `skill:${name}`;
    return true;
  }
  toggle(groupId: string): void {
    if (!this.groups().some((group) => group.id === groupId)) return;
    if (this.expanded.has(groupId)) this.expanded.delete(groupId);
    else this.expanded.add(groupId);
    this.focused = `group:${groupId}`;
  }
  expandAll(): void {
    this.expanded = new Set(this.groups().map((group) => group.id));
  }
  collapseAll(): void {
    const parent = this.rows().find((row) => row.id === this.focused)?.groupId;
    this.expanded.clear();
    this.focused = parent ? `group:${parent}` : this.rows()[0]?.id;
  }
  search(query: string): void {
    const value = query.trim().toLowerCase();
    if (value && !this.query)
      this.beforeSearch = { expanded: new Set(this.expanded), focused: this.focused };
    this.query = value;
    if (!value && this.beforeSearch) {
      this.expanded = this.beforeSearch.expanded;
      this.focused = this.beforeSearch.focused;
      this.beforeSearch = undefined;
      return;
    }
    if (value) this.expanded = new Set(this.groups().map((group) => group.id));
    const rows = this.rows();
    if (!rows.some((row) => row.id === this.focused))
      this.focused = rows.find((row) => row.kind === 'skill')?.id ?? rows[0]?.id;
  }
  move(key: SkillTreeKey): void {
    const rows = this.rows();
    if (!rows.length) {
      this.focused = undefined;
      return;
    }
    const index = Math.max(
      0,
      rows.findIndex((row) => row.id === this.focused),
    );
    const current = rows[index];
    if (key === 'Home') this.focused = rows[0].id;
    else if (key === 'End') this.focused = rows.at(-1)?.id;
    else if (key === 'ArrowDown') this.focused = rows[Math.min(rows.length - 1, index + 1)].id;
    else if (key === 'ArrowUp') this.focused = rows[Math.max(0, index - 1)].id;
    else if (key === 'ArrowLeft') {
      if (current.kind === 'skill') this.focused = `group:${current.groupId}`;
      else this.expanded.delete(current.groupId);
    } else if (key === 'ArrowRight' && current.kind === 'group') {
      if (this.expanded.has(current.groupId)) this.focused = rows[index + 1]?.id ?? current.id;
      else this.expanded.add(current.groupId);
    }
  }
}
