import { memo, useState, useEffect, useCallback, useRef, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import MenuIcon from '~icons/lucide/menu';
import XIcon from '~icons/lucide/x';
import SearchIcon from '~icons/lucide/search';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { DESK_EMBED_ENABLED, useDisplayMode } from '@/hooks/useDisplayMode';
import { requestDisplayMode } from '@/hooks/useDisplayModeEntry';
import { ROOT_SECTION_ID, SECTIONS, SECTION_MAP, getSectionPath } from '@/lib/sections';
import { motionEase, springStiff } from '@/lib/motion';
import { BEIAN_LINKS } from '@/data/beian-link';
import FFTVisualizer from '@/components/effects/FFTVisualizer';
import GlassSurface from '@/components/ui/GlassSurface';
import SurfacePanel from '@/components/ui/SurfacePanel';
import { acquireInputPause, releaseInputPause } from '@/hooks/useFullpageNavigation';
import { prefetchArticleBody } from '@/lib/article-body-cache';
import { openArticleFromClick, PRIVACY_ARTICLE_SLUG } from '@/lib/blog/client';

interface NavigationProps {
  currentSection?: string;
  onNavigate?: (section: string) => void;
  onOpenArticle?: (slug: string) => void;
  bgmPlaying?: boolean;
  onBGMToggle?: () => void;
  bgmAnalyser?: React.RefObject<AnalyserNode | null>;
  onNavSound?: () => void;
  onNavHover?: () => void;
  onOpenCommand?: () => void;
  onCommandIntent?: () => void;
  compact?: boolean;
}

export default memo(function Navigation({
  currentSection = ROOT_SECTION_ID,
  onNavigate,
  onOpenArticle,
  bgmPlaying,
  onBGMToggle,
  bgmAnalyser,
  onNavSound,
  onNavHover,
  onOpenCommand,
  onCommandIntent,
  compact = false,
}: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isDesktop } = useMediaCapabilities();
  const displayMode = useDisplayMode();
  const showMobileModeSwitch = !isDesktop && DESK_EMBED_ENABLED && displayMode === 'classic';
  const drawerRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const isDark = SECTION_MAP[currentSection as keyof typeof SECTION_MAP]?.isDark ?? true;
  const currentMeta =
    SECTION_MAP[currentSection as keyof typeof SECTION_MAP] ?? SECTION_MAP[ROOT_SECTION_ID];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isDesktop) setIsOpen(false);
  }, [isDesktop]);

  // Keep the mobile drawer modal: trap focus, pause fullpage input and restore
  // focus to the trigger after close.
  useFocusTrap(drawerRef, {
    active: isOpen && !isDesktop,
    onEscape: () => setIsOpen(false),
  });

  useEffect(() => {
    if (!isOpen || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const pauseToken = acquireInputPause('navigation');
    return () => {
      document.body.style.overflow = prev;
      releaseInputPause(pauseToken);
    };
  }, [isOpen, isDesktop]);

  const handleNavClick = useCallback(
    (sectionId: string) => {
      onNavSound?.();
      onNavigate?.(sectionId);
      setIsOpen(false);
    },
    [onNavigate, onNavSound],
  );

  const openPrivacy = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      openArticleFromClick(event, onOpenArticle, PRIVACY_ARTICLE_SLUG, () => setIsOpen(false));
    },
    [onOpenArticle],
  );

  const iconBtn = (dark: boolean) =>
    `p-2 rounded-[22px] transition-colors active:scale-95 ${
      dark ? 'text-white active:bg-white/15' : 'text-neutral-950 active:bg-black/10'
    }`;

  // Every button inside the glass shells mirrors the shell's corner radius so
  // the whole nav reads as one pill (mobile shell is always 22px).
  const navRadius = compact ? 22 : 26;
  const navRadiusCls = compact ? 'rounded-[22px]' : 'rounded-[26px]';

  return (
    <>
      {/* ── Mobile top chrome (SurfacePanel — lightweight, no SVG filters) ── */}
      <motion.nav
        className="lg:hidden fixed z-50 h-14 shrink-0"
        style={{
          right: 'max(0.75rem, env(safe-area-inset-right))',
          top: compact
            ? 'max(0.5rem, env(safe-area-inset-top))'
            : 'max(0.75rem, env(safe-area-inset-top))',
        }}
        animate={{
          width: compact
            ? 280
            : 'calc(100vw - max(1.5rem, env(safe-area-inset-left) + env(safe-area-inset-right)))',
        }}
        transition={{ duration: 0.35, ease: motionEase }}
        aria-label="Mobile navigation"
        aria-hidden={isOpen}
        inert={isOpen}
      >
        <SurfacePanel isDark={isDark} borderRadius={22} className="h-full">
          <div className="flex h-full w-full items-center justify-between px-3">
            <motion.button
              type="button"
              data-cursor="MENU"
              className={`min-w-0 rounded-[22px] px-3 py-2 text-left transition-colors ${
                isDark ? 'text-white active:bg-white/12' : 'text-neutral-950 active:bg-black/8'
              }`}
              onClick={() => setIsOpen((v) => !v)}
              animate={{ maxWidth: compact ? 82 : 150 }}
              transition={{ duration: 0.3, ease: motionEase }}
              aria-expanded={isOpen}
              aria-controls="mobile-nav-drawer"
            >
              <span className="block truncate text-xs font-bold tracking-eyebrow">
                {compact ? currentMeta.zh : currentMeta.en}
              </span>
              <motion.span
                className="block truncate text-micro tracking-[0.14em] opacity-55"
                animate={{ opacity: compact ? 0 : 0.55, height: compact ? 0 : 14 }}
              >
                {compact ? currentMeta.en : currentMeta.zh}
              </motion.span>
            </motion.button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className={`${iconBtn(isDark)} min-h-11 min-w-11 grid place-items-center`}
                onClick={() => onOpenCommand?.()}
                onMouseEnter={onCommandIntent}
                onFocus={onCommandIntent}
                aria-label="Open command palette"
                data-cursor="SEARCH"
              >
                <SearchIcon width={18} height={18} />
              </button>
              <button
                type="button"
                className={`${iconBtn(isDark)} min-h-11 min-w-11 grid place-items-center`}
                onClick={onBGMToggle}
                aria-label={bgmPlaying ? 'Pause music' : 'Play music'}
                data-cursor="AUDIO"
              >
                <FFTVisualizer analyser={bgmAnalyser?.current ?? null} playing={!!bgmPlaying} />
              </button>
              {showMobileModeSwitch && (
                <button
                  type="button"
                  data-mode-toggle
                  data-mode="classic"
                  className={`${iconBtn(isDark)} min-h-11 min-w-11 grid place-items-center`}
                  onClick={(event) => requestDisplayMode('win95', event.currentTarget)}
                  aria-label="切换到 Win95 像素桌面"
                  title="切换到 Win95 像素桌面"
                  data-cursor="none"
                >
                  <img
                    src="/mhk10-logo.svg"
                    alt=""
                    width={18}
                    height={18}
                    className="[image-rendering:pixelated]"
                    aria-hidden="true"
                  />
                </button>
              )}
              <button
                ref={menuTriggerRef}
                type="button"
                className={`${iconBtn(isDark)} min-h-11 min-w-11 grid place-items-center`}
                onClick={() => setIsOpen((v) => !v)}
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
                data-cursor={isOpen ? 'CLOSE' : 'MENU'}
              >
                {isOpen ? <XIcon width={22} height={22} /> : <MenuIcon width={22} height={22} />}
              </button>
            </div>
          </div>
        </SurfacePanel>
      </motion.nav>

      {/* ── Desktop chrome (GlassSurface only on lg+) ── */}
      {isDesktop && (
        <motion.nav
          className="hidden lg:flex fixed right-4 xl:right-6 z-50 items-center justify-end transition-opacity duration-500"
          animate={{ top: compact ? 12 : 18, height: compact ? 48 : 58 }}
          transition={{ duration: 0.38, ease: motionEase }}
          aria-label="Desktop navigation"
        >
          <GlassSurface
            isDark={isDark}
            width="auto"
            height="100%"
            borderRadius={navRadius}
            borderWidth={0.09}
            brightness={isDark ? 72 : 48}
            opacity={0.86}
            blur={12}
            displace={0.25}
            distortionScale={isDark ? -150 : -96}
            redOffset={isDark ? 4 : 2}
            greenOffset={isDark ? 14 : 5}
            blueOffset={isDark ? 24 : 9}
            backgroundOpacity={mounted ? (isDark ? 0.16 : 0.38) : 0}
            saturation={1.8}
            className={`border transition-colors duration-500 ${isDark ? 'border-white/16' : 'border-black/10'}`}
          >
            <div className="flex h-full w-max items-center justify-end gap-2 px-2.5 lg:px-3">
              <div className="flex min-w-0 items-center justify-end gap-0.5">
                {SECTIONS.map((section) => {
                  const active = currentSection === section.id;
                  return (
                    <a
                      key={section.id}
                      href={getSectionPath(section.id)}
                      data-cursor="GO"
                      onClick={(event) => {
                        event.preventDefault();
                        handleNavClick(section.id);
                      }}
                      onMouseEnter={onNavHover}
                      className={`relative ${navRadiusCls} text-xs font-mono uppercase tracking-widest transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent-base focus-visible:outline-none ${
                        compact ? 'px-2.5 py-1.5' : 'px-3 py-2 lg:px-3.5'
                      } ${
                        active
                          ? isDark
                            ? 'text-white'
                            : 'text-neutral-950'
                          : isDark
                            ? 'text-white/50 hover:text-white/85'
                            : 'text-black/42 hover:text-neutral-950'
                      }`}
                    >
                      {active && (
                        <motion.span
                          className={`absolute inset-0 ${navRadiusCls} ${isDark ? 'bg-white/10' : 'bg-accent-wash'}`}
                          layoutId="nav-indicator"
                          transition={springStiff}
                        />
                      )}
                      <span className="relative block">{section.en}</span>
                      <motion.span
                        className="relative block overflow-hidden text-micro tracking-normal opacity-55"
                        animate={{ height: compact ? 0 : 14, opacity: compact ? 0 : 0.55 }}
                        transition={{ duration: 0.28, ease: motionEase }}
                      >
                        {section.zh}
                      </motion.span>
                    </a>
                  );
                })}
              </div>

              <div
                className={`flex items-center gap-1 border-l pl-2 ${isDark ? 'border-white/12' : 'border-black/10'}`}
              >
                <button
                  type="button"
                  onClick={() => onOpenCommand?.()}
                  onMouseEnter={onCommandIntent}
                  onFocus={onCommandIntent}
                  className={`${navRadiusCls} transition-colors ${compact ? 'p-2' : 'p-2.5'} ${
                    isDark ? 'text-white hover:bg-white/10' : 'text-neutral-950 hover:bg-black/5'
                  }`}
                  aria-label="Open command palette"
                  data-cursor="SEARCH"
                >
                  <SearchIcon width={compact ? 16 : 18} height={compact ? 16 : 18} />
                </button>
                <button
                  type="button"
                  onClick={onBGMToggle}
                  className={`${navRadiusCls} transition-colors ${compact ? 'p-2' : 'p-2.5'} ${
                    isDark ? 'text-white hover:bg-white/10' : 'text-neutral-950 hover:bg-black/5'
                  }`}
                  aria-label={bgmPlaying ? 'Pause music' : 'Play music'}
                  data-cursor="AUDIO"
                >
                  <FFTVisualizer analyser={bgmAnalyser?.current ?? null} playing={!!bgmPlaying} />
                </button>
              </div>
            </div>
          </GlassSurface>
        </motion.nav>
      )}

      {/* ── Mobile drawer (solid tonal panel — no GlassSurface) ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-30 bg-black/55 lg:hidden"
              onClick={() => setIsOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              aria-hidden
            />

            <motion.aside
              ref={drawerRef}
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Section menu"
              className="fixed z-60 w-[min(19rem,calc(100vw-1.5rem))] lg:hidden"
              style={{
                right: 'max(0.75rem, env(safe-area-inset-right))',
                top: 'max(5rem, calc(env(safe-area-inset-top) + 4.5rem))',
                bottom: 'max(1rem, env(safe-area-inset-bottom))',
              }}
              initial={{ x: '108%', opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '108%', opacity: 0.6 }}
              transition={{ duration: 0.32, ease: motionEase }}
            >
              <SurfacePanel isDark={isDark} borderRadius={24} className="h-full flex flex-col">
                {/* Brand accent rail */}
                <div
                  aria-hidden
                  className="absolute left-0 top-5 bottom-5 w-0.75 rounded-full bg-accent-base"
                  style={{
                    boxShadow:
                      '0 0 12px color-mix(in srgb, var(--section-accent) 55%, transparent)',
                  }}
                />

                <div
                  className={`flex items-center justify-between px-5 pt-5 pb-3 border-b ${isDark ? 'border-white/8' : 'border-black/8'}`}
                >
                  <div>
                    <p
                      className={`text-micro font-mono uppercase tracking-eyebrow ${isDark ? 'text-white/40' : 'text-black/40'}`}
                    >
                      Navigate
                    </p>
                    <p
                      className={`mt-1 text-sm font-bold tracking-wide ${isDark ? 'text-white' : 'text-neutral-950'}`}
                    >
                      目录 / MENU
                    </p>
                  </div>
                  <span
                    className={`font-mono text-micro tabular-nums ${isDark ? 'text-white/35' : 'text-black/35'}`}
                  >
                    {String(SECTIONS.findIndex((s) => s.id === currentSection) + 1).padStart(
                      2,
                      '0',
                    )}
                    <span className={isDark ? 'text-white/20' : 'text-black/20'}>
                      /{String(SECTIONS.length).padStart(2, '0')}
                    </span>
                  </span>
                </div>

                <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                  {SECTIONS.map((section, index) => {
                    const active = currentSection === section.id;
                    return (
                      <motion.a
                        key={section.id}
                        href={getSectionPath(section.id)}
                        onClick={(event) => {
                          event.preventDefault();
                          handleNavClick(section.id);
                        }}
                        data-cursor="GO"
                        className={`group relative mb-1 flex items-center gap-3 rounded-xl px-3.5 py-3.5 transition-colors ${
                          active
                            ? isDark
                              ? 'bg-accent-base/28 text-white'
                              : 'bg-accent-wash text-neutral-950'
                            : isDark
                              ? 'text-white/62 active:bg-white/8 hover:bg-white/6 hover:text-white'
                              : 'text-black/55 active:bg-black/6 hover:bg-black/5 hover:text-neutral-950'
                        }`}
                        initial={{ x: 24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 16, opacity: 0 }}
                        transition={{ duration: 0.28, delay: index * 0.035, ease: motionEase }}
                      >
                        <span
                          className={`w-6 shrink-0 font-mono text-micro tabular-nums tracking-wider ${
                            active
                              ? 'text-accent-ink'
                              : isDark
                                ? 'text-white/30 group-hover:text-white/50'
                                : 'text-black/32 group-hover:text-black/55'
                          }`}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium tracking-mono">
                            {section.en}
                          </span>
                          <span className="mt-0.5 block text-xs tracking-normal opacity-50">
                            {section.zh}
                          </span>
                        </span>
                        {active && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-base"
                            style={{
                              boxShadow:
                                '0 0 8px color-mix(in srgb, var(--section-accent) 90%, transparent)',
                            }}
                            aria-hidden
                          />
                        )}
                      </motion.a>
                    );
                  })}
                </nav>

                <div
                  className={`px-5 py-4 border-t ${isDark ? 'border-white/8' : 'border-black/8'}`}
                >
                  <p
                    className={`font-mono text-micro tracking-mono uppercase ${isDark ? 'text-white/30' : 'text-black/35'}`}
                  >
                    MiraHikari · System
                  </p>
                  <div
                    className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono ${isDark ? 'text-white/25' : 'text-black/30'}`}
                  >
                    <a
                      href={BEIAN_LINKS.icp.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-accent-ink transition-colors"
                    >
                      {BEIAN_LINKS.icp.label}
                    </a>
                    <span className={isDark ? 'text-white/10' : 'text-black/10'}>|</span>
                    <a
                      href={BEIAN_LINKS.police.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-accent-ink transition-colors"
                    >
                      {BEIAN_LINKS.police.label}
                    </a>
                    <span className={isDark ? 'text-white/10' : 'text-black/10'}>|</span>
                    <a
                      href={`/blog/${PRIVACY_ARTICLE_SLUG}`}
                      className="hover:text-accent-ink transition-colors"
                      onPointerEnter={() => prefetchArticleBody(PRIVACY_ARTICLE_SLUG)}
                      onFocus={() => prefetchArticleBody(PRIVACY_ARTICLE_SLUG)}
                      onClick={openPrivacy}
                    >
                      隐私说明
                    </a>
                  </div>
                </div>
              </SurfacePanel>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
});
