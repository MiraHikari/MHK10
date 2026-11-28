import SearchIcon from '~icons/lucide/search';
import XIcon from '~icons/lucide/x';
import ArrowDownWideNarrowIcon from '~icons/lucide/arrow-down-wide-narrow';
import ArrowUpNarrowWideIcon from '~icons/lucide/arrow-up-narrow-wide';
import { skillCategories } from '@/data/profile';
import { cn } from '@/lib/utils';
import type { SkillCounts, SkillSort } from './useSkillFilter';

interface SkillFilterBarProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly activeCategory: string | null;
  readonly onCategoryChange: (category: string | null) => void;
  readonly sort: SkillSort;
  readonly onSortChange: (sort: SkillSort) => void;
  readonly counts: SkillCounts;
}

const SORT_CYCLE: readonly SkillSort[] = ['level', 'years', 'name'];

const SORT_LABEL: Readonly<Record<SkillSort, string>> = {
  level: 'LEVEL',
  years: 'YEARS',
  name: 'NAME',
};

const chipBase =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-1 font-mono text-caption uppercase tracking-mono transition-colors duration-150';
const chipActive = 'border-accent-base bg-accent-base text-accent-on';
const chipIdle =
  'border-black/10 bg-white/60 text-gray-500 hover:border-black/25 hover:text-neutral-950';

export default function SkillFilterBar({
  query,
  onQueryChange,
  activeCategory,
  onCategoryChange,
  sort,
  onSortChange,
  counts,
}: SkillFilterBarProps) {
  const nextSort = SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
      {/* 搜索 */}
      <div className="relative w-full sm:w-64">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索技能 / 关键字…"
          className="min-h-11 w-full border border-black/10 bg-white/60 py-1.5 pl-8 pr-8 text-sm text-neutral-950 outline-none transition-colors placeholder:text-gray-400 focus:border-accent-base focus:bg-white"
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="清除搜索"
            className="absolute right-1.5 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-sm text-gray-400 transition-colors hover:text-neutral-950"
          >
            <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 分类 chips：手机单行横向滚动，桌面自然换行 */}
      <div
        role="group"
        aria-label="技能分类"
        data-horizontal-scroll="skills"
        className="flex w-full items-center gap-1.5 overflow-x-auto pb-1 pr-6 [mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_1.75rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0 sm:[mask-image:none]"
      >
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          aria-pressed={activeCategory === null}
          className={cn(chipBase, activeCategory === null ? chipActive : chipIdle)}
        >
          ALL · {counts.matched}
        </button>
        {skillCategories.map((meta) => {
          const count = counts.byCategory.get(meta.id) ?? 0;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onCategoryChange(activeCategory === meta.id ? null : meta.id)}
              aria-pressed={activeCategory === meta.id}
              className={cn(
                chipBase,
                activeCategory === meta.id ? chipActive : count === 0 ? 'opacity-45' : chipIdle,
              )}
            >
              {meta.label} · {count}
            </button>
          );
        })}
      </div>

      {/* 排序三态循环 */}
      <div className="sm:ml-auto">
        <button
          type="button"
          onClick={() => onSortChange(nextSort)}
          aria-label={`排序方式 ${SORT_LABEL[sort]},点击切换`}
          title={`排序:${SORT_LABEL[sort]}`}
          className={cn(chipBase, chipIdle)}
        >
          {sort === 'name' ? (
            <ArrowUpNarrowWideIcon aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownWideNarrowIcon aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {SORT_LABEL[sort]}
        </button>
      </div>
    </div>
  );
}
