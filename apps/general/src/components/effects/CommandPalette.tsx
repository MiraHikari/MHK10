import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { AnimatePresence } from 'motion/react';
import CommandPalettePanel from '@/components/effects/CommandPalettePanel';
import { useCommandRecents } from '@/hooks/useCommandRecents';
import { useCommandSearch } from '@/hooks/useCommandSearch';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useLucidMode, toggleLucidMode } from '@/hooks/useLucidMode';
import { acquireInputPause, releaseInputPause } from '@/hooks/useFullpageNavigation';
import { getArticleSlugFromPath } from '@/lib/blog/client';
import { writeClipboard } from '@/lib/clipboard';
import { resetSearch } from '@/lib/blog/search';
import { useZenMode } from '@/lib/blog/reading-prefs';
import {
  COMMAND_HANDLERS,
  type Command,
  type CommandContext,
  createDynamicCommands,
  createStaticCommands,
  resolveDynamicHandler,
} from '@/lib/command-registry';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';

interface CommandPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNavigate: (sectionId: string) => void;
  readonly onNavigateToItem?: (sectionId: string, itemId: string) => void;
  readonly onOpenArticle?: (slug: string) => void;
  readonly bgmPlaying?: boolean;
  readonly bgmAnalyser?: RefObject<AnalyserNode | null>;
  readonly onToggleBGM?: () => void;
  readonly onOpenContactQR?: (index: number) => void;
  readonly projects?: readonly Project[];
  readonly articles?: readonly ArticleListItem[];
  /** Section currently on screen — lets `random-section` skip it. */
  readonly currentSection: string;
}

function openCommandUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNavigateToItem,
  onOpenArticle,
  bgmPlaying = false,
  bgmAnalyser,
  onToggleBGM,
  onOpenContactQR,
  projects = [],
  articles = [],
  currentSection,
}: CommandPaletteProps) {
  const lucidMode = useLucidMode();
  const zenMode = useZenMode();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLLIElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const staticCommands = useMemo(
    () => createStaticCommands(bgmPlaying, lucidMode, zenMode),
    [bgmPlaying, lucidMode, zenMode],
  );
  const listedArticles = useMemo(() => articles.filter((article) => article.listed), [articles]);
  const dynamicCommands = useMemo(
    () => createDynamicCommands({ projects, articles: listedArticles }),
    [projects, listedArticles],
  );
  const {
    recents,
    recentArticleSlugs,
    saveRecent,
    saveRecentArticleSlug,
    refreshRecents,
    refreshRecentArticles,
  } = useCommandRecents();
  const { filtered, groups, calcInfo, isStale } = useCommandSearch({
    query,
    staticCommands,
    projectCommands: dynamicCommands.projectCommands,
    tagCommands: dynamicCommands.tagCommands,
    skillCommands: dynamicCommands.skillCommands,
    honorCommands: dynamicCommands.honorCommands,
    articles: listedArticles,
    recents,
    recentArticleSlugs,
    copied,
  });

  useFocusTrap(panelRef, {
    active: open,
    onEscape: onClose,
  });

  useEffect(() => {
    resetSearch();
  }, [articles]);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  // 只有键盘切换选中项时才滚动列表：鼠标 hover 也会更新选中项，
  // 若同样 scrollIntoView，列表会在指针下滑动、把 hover 目标抽走。
  const scrollSelectionRef = useRef(false);

  // 查询变化与选中项归零在同一次更新里完成，避免先提交一个越界的
  // selectedIndex（aria-activedescendant 指向已删除的节点）。
  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    scrollSelectionRef.current = true;
  }, []);

  useEffect(() => {
    if (!scrollSelectionRef.current) return;
    scrollSelectionRef.current = false;
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const pauseToken = acquireInputPause('command-palette');

    // 打开期间锁定根滚动,防止移动端背景被拖动。
    const html = document.documentElement;
    const originalOverflow = html.style.overflow;
    html.style.overflow = 'hidden';

    setQuery('');
    setSelectedIndex(0);
    refreshRecents();

    const slug = getArticleSlugFromPath(window.location.pathname);
    if (slug && articles.some((article) => article.id === slug)) {
      saveRecentArticleSlug(slug);
    } else {
      refreshRecentArticles();
    }

    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const frameId = finePointer ? window.requestAnimationFrame(() => inputRef.current?.focus()) : 0;
    return () => {
      window.cancelAnimationFrame(frameId);
      html.style.overflow = originalOverflow;
      releaseInputPause(pauseToken);
    };
  }, [open, articles, refreshRecents, refreshRecentArticles, saveRecentArticleSlug]);

  const execute = useCallback(
    (command: Command) => {
      if (isStale) return;

      saveRecent(command.id);

      if (command.id === 'copy-result') {
        if (calcInfo?.ok) {
          void writeClipboard(String(calcInfo.value)).then(setCopied);
        }
        return;
      }

      if (command.id.startsWith('article-')) {
        saveRecentArticleSlug(command.id.slice('article-'.length));
      }

      const context: CommandContext = {
        navigate: onNavigate,
        navigateToArticle: (slug) => {
          if (onOpenArticle) {
            onOpenArticle(slug);
            return;
          }
          window.location.assign(`/blog/${slug}`);
        },
        navigateToItem: (sectionId, itemId) => {
          if (onNavigateToItem) {
            onNavigateToItem(sectionId, itemId);
            return;
          }
          onNavigate(sectionId);
        },
        openUrl: openCommandUrl,
        toggleBGM: () => onToggleBGM?.(),
        openContactQR: (index) => onOpenContactQR?.(index),
        copyToClipboard: (text) => {
          void writeClipboard(text);
        },
        closePalette: onClose,
        toggleLucidMode,
        currentSectionId: currentSection,
      };
      const handler = COMMAND_HANDLERS[command.id] ?? resolveDynamicHandler(command);

      if (handler) {
        void handler(context);
      } else if (command.url) {
        openCommandUrl(command.url);
      } else if (command.type === 'nav') {
        onNavigate(command.id);
      }

      onClose();
    },
    [
      calcInfo,
      currentSection,
      isStale,
      onClose,
      onNavigate,
      onNavigateToItem,
      onOpenArticle,
      onOpenContactQR,
      onToggleBGM,
      saveRecent,
      saveRecentArticleSlug,
    ],
  );

  // 键盘处理经 useEffectEvent 读取最新的 filtered/selectedIndex/execute：
  // 监听只在 open 切换时挂载一次，不再每敲一个键就重挂 window 监听。
  const onPaletteKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // IME 组合中（拼音候选上屏）的 Enter / Escape / 方向键属于输入法，
    // 不是面板命令：既不执行选中项，也不关闭面板。Safari 的
    // compositionend 可能先于 keydown 派发，故同时看 keyCode 229。
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      scrollSelectionRef.current = true;
      setSelectedIndex((index) => (index + 1) % Math.max(filtered.length, 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      scrollSelectionRef.current = true;
      const length = Math.max(filtered.length, 1);
      setSelectedIndex((index) => (index - 1 + length) % length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = filtered[selectedIndex];
      if (command) execute(command);
    }
  });

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => onPaletteKeyDown(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <CommandPalettePanel
          panelRef={panelRef}
          query={query}
          resultCount={filtered.length}
          isStale={isStale}
          calcInfo={calcInfo}
          groups={groups}
          selectedIndex={selectedIndex}
          activeOptionId={
            filtered[selectedIndex] ? `command-option-${filtered[selectedIndex].id}` : undefined
          }
          inputRef={inputRef}
          listRef={listRef}
          selectedRef={selectedRef}
          articles={listedArticles}
          projects={projects}
          bgmPlaying={bgmPlaying}
          bgmAnalyser={bgmAnalyser}
          onToggleBGM={onToggleBGM}
          onQueryChange={changeQuery}
          onSelectIndex={setSelectedIndex}
          onExecute={execute}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}
