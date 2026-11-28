import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react';
import SearchIcon from '~icons/lucide/search';
import CommandPaletteResults from '@/components/effects/CommandPaletteResults';
import CommandPaletteHome from '@/components/effects/palette/CommandPaletteHome';
import { motionEase, springStiff } from '@/lib/motion';
import { useMediaCapabilities, useMediaQuery } from '@/hooks/useMediaCapabilities';
import { SEARCH_LIMITERS, type Command, parseQueryPrefix } from '@/lib/command-registry';
import type { UseCommandSearchResult } from '@/hooks/useCommandSearch';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';

type CalcInfo = UseCommandSearchResult['calcInfo'];

interface CommandPalettePanelProps {
  readonly panelRef?: RefObject<HTMLDivElement | null>;
  readonly query: string;
  readonly resultCount: number;
  readonly isStale: boolean;
  readonly calcInfo: CalcInfo;
  readonly groups: UseCommandSearchResult['groups'];
  readonly selectedIndex: number;
  readonly activeOptionId?: string;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly listRef: RefObject<HTMLUListElement | null>;
  readonly selectedRef: RefObject<HTMLLIElement | null>;
  readonly articles: readonly ArticleListItem[];
  readonly projects: readonly Project[];
  readonly bgmPlaying: boolean;
  readonly bgmAnalyser?: RefObject<AnalyserNode | null>;
  readonly onToggleBGM?: () => void;
  readonly onQueryChange: (query: string) => void;
  readonly onSelectIndex: (index: number) => void;
  readonly onExecute: (command: Command) => void;
  readonly onClose: () => void;
}

/** 搜索框占位文案轮换：依次展示面板的不同用法，reduced 动效下固定为第一条。 */
const PLACEHOLDERS = [
  '搜索命令、文章、项目、技能…',
  ':blog 加关键词，只搜文章…',
  '= 1+1 当作计算器…',
  ':skill 加名称，直达技能…',
] as const;
const PLACEHOLDER_INTERVAL_MS = 4000;

function hintForQuery(query: string, resultCount: number, hasCalcInfo: boolean): string {
  if (hasCalcInfo) return '计算器模式 · Enter 复制结果';

  const parsed = parseQueryPrefix(query);
  switch (parsed.prefix) {
    case 'cmd':
      return '命令模式 · 仅搜索操作与导航';
    case 'blog':
    case 'article':
      return '文章模式 · 仅搜索博客文章';
    case 'project':
      return '项目模式 · 仅搜索项目';
    case 'tag':
      return '标签模式 · 仅搜索文章标签';
    case 'skill':
      return '技能模式 · 仅搜索技能';
    case 'honor':
      return '荣誉模式 · 仅搜索荣誉';
    case null:
      return query.trim()
        ? `匹配 ${resultCount} 条结果`
        : '最近使用 · 输入关键字模糊搜索 · :前缀 分类筛选';
  }
}

function emptyMessage(hasCalcInfo: boolean): string {
  return hasCalcInfo ? '没有更多结果' : '没有匹配的结果 — 试试其他关键词';
}

function nextLimiterQuery(query: string, prefix: string) {
  const parsed = parseQueryPrefix(query);
  const term = parsed.prefix ? parsed.term.trimStart() : query.trimStart();
  return term ? `:${prefix} ${term}` : `:${prefix} `;
}

export default function CommandPalettePanel({
  panelRef,
  query,
  resultCount,
  isStale,
  calcInfo,
  groups,
  selectedIndex,
  activeOptionId,
  inputRef,
  listRef,
  selectedRef,
  articles,
  projects,
  bgmPlaying,
  bgmAnalyser,
  onToggleBGM,
  onQueryChange,
  onSelectIndex,
  onExecute,
  onClose,
}: CommandPalettePanelProps) {
  const hasCalcInfo = Boolean(calcInfo);
  const activePrefix = parseQueryPrefix(query).prefix;
  const showHome = query.trim() === '' && !hasCalcInfo;
  const mdUp = useMediaQuery('(min-width: 768px)');
  const { reducedMotion } = useMediaCapabilities();
  const [phraseIndex, setPhraseIndex] = useState(0);

  /* 占位文案轮换：页面隐藏时暂停，面板卸载随 effect 清理自动停止。 */
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setPhraseIndex((value) => (value + 1) % PLACEHOLDERS.length);
    }, PLACEHOLDER_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  /* 移动端 grip 拖拽关闭:跟手位移,超过阈值关闭,否则回弹。
     位移走 motion value：逐帧 setState 会重渲染整棵结果列表。 */
  const dragY = useMotionValue(0);
  const dragState = useRef({ startY: 0, dragging: false });

  const onGripPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { startY: event.clientY, dragging: true };
  };
  const onGripPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    dragY.set(Math.max(0, event.clientY - dragState.current.startY));
  };
  const onGripPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    if (event.clientY - dragState.current.startY > 80) onClose();
    else animate(dragY, 0, { duration: 0.2, ease: motionEase });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center md:items-start md:px-5 md:pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        className="relative z-10 w-full md:max-w-3xl xl:max-w-4xl"
        initial={mdUp ? { opacity: 0, scale: 0.96, y: -8 } : { opacity: 1, y: '100%' }}
        animate={mdUp ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, y: 0 }}
        exit={mdUp ? { opacity: 0, scale: 0.96, y: -8 } : { opacity: 1, y: '100%' }}
        transition={springStiff}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <motion.div
          ref={panelRef}
          className="flex w-full flex-col border border-accent-base/40 bg-neutral-950 shadow-lift max-md:border-x-0 max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)]"
          style={{
            maxHeight: mdUp
              ? 'calc(92dvh - max(1rem, env(safe-area-inset-bottom)))'
              : 'calc(88dvh - env(safe-area-inset-bottom))',
            y: dragY,
          }}
        >
          {/* 移动端拖拽 grip */}
          <div
            className="flex touch-none justify-center pb-1 pt-2 md:hidden"
            onPointerDown={onGripPointerDown}
            onPointerMove={onGripPointerMove}
            onPointerUp={onGripPointerEnd}
            onPointerCancel={onGripPointerEnd}
          >
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          <div className="flex items-center gap-3 px-4 border-b border-white/10">
            <SearchIcon className="w-4 h-4 text-white/40 shrink-0" />
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={reducedMotion ? PLACEHOLDERS[0] : ''}
                className="w-full bg-transparent py-3.5 text-sm text-white/90 placeholder:text-white/30 outline-none font-mono"
                spellCheck={false}
                autoComplete="off"
                aria-label="搜索命令"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-results"
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
              />
              {/* 轮换占位：空查询时的自定义动画层，reduced 下退回原生 placeholder */}
              {!reducedMotion && query === '' && (
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center"
                  aria-hidden="true"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={phraseIndex}
                      className="block text-sm font-mono text-white/30"
                      initial={{ opacity: 0, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, filter: 'blur(4px)' }}
                      transition={{ duration: 0.3, ease: motionEase }}
                    >
                      {PLACEHOLDERS[phraseIndex]}
                    </motion.span>
                  </AnimatePresence>
                </span>
              )}
            </div>
            <kbd className="text-micro font-mono text-white/30 border border-white/15 px-1.5 py-0.5">
              ESC
            </kbd>
          </div>

          <div
            className="px-4 py-2.5 text-micro font-mono text-white/25 border-b border-white/10"
            aria-live="polite"
          >
            {hintForQuery(query, resultCount, hasCalcInfo)}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white/10 border-b border-white/10">
            {SEARCH_LIMITERS.map((limiter) => {
              const isActive = activePrefix === limiter.prefix;
              return (
                <button
                  key={limiter.prefix}
                  type="button"
                  onClick={() => {
                    onQueryChange(nextLimiterQuery(query, limiter.prefix));
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className={`flex min-h-11 items-center justify-between gap-2 bg-neutral-950 px-3 py-2 text-left font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-base ${
                    isActive
                      ? 'text-white bg-accent-base/20'
                      : 'text-white/45 hover:text-white/80 hover:bg-white/5'
                  }`}
                  aria-pressed={isActive}
                >
                  <span className="text-xs">:{limiter.prefix}</span>
                  <span className="text-micro text-white/30 truncate">{limiter.label}</span>
                </button>
              );
            })}
          </div>

          {calcInfo && (
            <div className="px-4 py-3 border-b border-white/10 font-mono">
              <div className="flex items-baseline gap-3">
                <span className="text-micro text-white/30 shrink-0">输入</span>
                <span className="text-xs text-white/70 truncate">{query.trim()}</span>
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-micro text-white/30 shrink-0">结果</span>
                <span
                  className={`text-sm font-bold ${calcInfo.ok ? 'text-[#6CE5E8]' : 'text-red-400'}`}
                >
                  = {calcInfo.ok ? String(calcInfo.value) : calcInfo.error}
                </span>
              </div>
            </div>
          )}

          <div
            className={`min-h-0 flex-1 overflow-y-auto py-1 transition-opacity ${
              isStale ? 'pointer-events-none opacity-50' : 'opacity-100'
            }`}
            aria-busy={isStale}
          >
            {showHome && (
              <CommandPaletteHome
                articles={articles}
                projects={projects}
                bgmPlaying={bgmPlaying}
                bgmAnalyser={bgmAnalyser}
                onToggleBGM={onToggleBGM}
              />
            )}
            <CommandPaletteResults
              id="command-palette-results"
              groups={groups}
              emptyMessage={emptyMessage(hasCalcInfo)}
              query={query}
              selectedIndex={selectedIndex}
              listRef={listRef}
              selectedRef={selectedRef}
              onSelectIndex={onSelectIndex}
              onExecute={onExecute}
            />
          </div>

          <div className="hidden md:flex items-center justify-between px-4 py-2 border-t border-white/10 text-micro font-mono text-white/25">
            <span>⌘K 唤起</span>
            <span>↑↓ 浏览</span>
            <span>↵ 打开</span>
            <span>esc 关闭</span>
          </div>
          <div className="flex md:hidden items-center justify-center px-4 py-2.5 border-t border-white/10 text-micro font-mono text-white/25">
            <span>点击选择 · 下滑或点击空白处关闭</span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
