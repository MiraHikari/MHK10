import { useCallback, useMemo, useState } from 'react';
import { matchScore } from '@/lib/command-match';
import { skillCategories, skills, type SkillCategoryMeta, type SkillItem } from '@/data/profile';

export type SkillSort = 'level' | 'years' | 'name';

export interface SkillGroup {
  readonly meta: SkillCategoryMeta;
  readonly items: readonly SkillItem[];
}

export interface SkillCounts {
  readonly total: number;
  readonly matched: number;
  /** 每个分类在 query 下的匹配数(不受 activeCategory 影响,供 chip 计数)。 */
  readonly byCategory: ReadonlyMap<string, number>;
}

export interface SkillFilterState {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly activeCategory: string | null;
  readonly setActiveCategory: (category: string | null) => void;
  readonly sort: SkillSort;
  readonly setSort: (sort: SkillSort) => void;
  readonly reset: () => void;
  /** 排序后的匹配全集(未按分类分组)。 */
  readonly filtered: readonly SkillItem[];
  /** 按 skillCategories 顺序分组、应用 activeCategory 与 query 后的非空组。 */
  readonly visibleGroups: readonly SkillGroup[];
  readonly counts: SkillCounts;
}

const CATEGORY_LABELS: ReadonlyMap<string, string> = new Map(
  skillCategories.map((meta) => [meta.id, meta.label]),
);

function matchesQuery(skill: SkillItem, query: string): boolean {
  if (query === '') return true;
  const haystack = [
    skill.name,
    skill.note ?? '',
    CATEGORY_LABELS.get(skill.category) ?? skill.category,
    ...(skill.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return matchScore(query, haystack) !== null;
}

function compareSkills(a: SkillItem, b: SkillItem, sort: SkillSort): number {
  if (sort === 'level') return b.level - a.level;
  if (sort === 'years') return (b.years ?? 0) - (a.years ?? 0);
  return a.name.localeCompare(b.name, 'en');
}

export function useSkillFilter(): SkillFilterState {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SkillSort>('level');

  const reset = useCallback(() => {
    setQuery('');
    setActiveCategory(null);
    setSort('level');
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo<readonly SkillItem[]>(
    () =>
      skills
        .filter((skill) => matchesQuery(skill, normalizedQuery))
        .sort((a, b) => compareSkills(a, b, sort)),
    [normalizedQuery, sort],
  );

  const counts = useMemo<SkillCounts>(() => {
    const byCategory = new Map<string, number>();
    for (const skill of skills) {
      if (!matchesQuery(skill, normalizedQuery)) continue;
      byCategory.set(skill.category, (byCategory.get(skill.category) ?? 0) + 1);
    }
    return { total: skills.length, matched: filtered.length, byCategory };
  }, [normalizedQuery, filtered.length]);

  const visibleGroups = useMemo<readonly SkillGroup[]>(() => {
    const groups: SkillGroup[] = [];
    for (const meta of skillCategories) {
      if (activeCategory !== null && meta.id !== activeCategory) continue;
      const items = filtered.filter((skill) => skill.category === meta.id);
      if (items.length > 0) groups.push({ meta, items });
    }
    return groups;
  }, [filtered, activeCategory]);

  return {
    query,
    setQuery,
    activeCategory,
    setActiveCategory,
    sort,
    setSort,
    reset,
    filtered,
    visibleGroups,
    counts,
  };
}
