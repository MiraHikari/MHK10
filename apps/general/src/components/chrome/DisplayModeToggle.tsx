import { memo } from 'react';
import { FAVICON_VARIANTS } from '@/data/favicon';
import {
  DESK_EMBED_ENABLED,
  useDisplayMode,
  useVisibleDisplayMode,
  type DisplayMode,
} from '@/hooks/useDisplayMode';
import { requestDisplayMode } from '@/hooks/useDisplayModeEntry';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import '@/styles/features/fusion.css';

/** 两种模式下分别显示对方模式的图标与目标名：点击即切换。 */
const TARGET: Record<DisplayMode, { label: string; hint: string }> = {
  win95: {
    label: 'WIN95',
    hint: '切换到 Win95 像素桌面',
  },
  classic: {
    label: 'GENERAL',
    hint: '切换到通用版，继续浏览当前内容',
  },
};

/**
 * 模式切换入口（右缘中段的紧凑图标片）。
 *
 * 默认只占一个 44px 的图标位，hover / 键盘 focus 时才横向展开目标名；不再
 * 常驻一块带模糊与阴影的竖向长条。classic 桌面端把图标片放在右缘章节指示点
 * 列的左侧（`lg:right-16`），不再压住现有点状进度；Win95 画布没有这列 chrome，
 * 仍使用最右缘的窄位。z-[90]：高于 iframe 宿主（z-80），低于 BootLoader（z-100）。
 *
 * `PUBLIC_DESK_URL` 未配置（kill switch）时不渲染。
 */
export default memo(function DisplayModeToggle() {
  const requestedMode = useDisplayMode();
  const mode = useVisibleDisplayMode();
  const { isDesktop } = useMediaCapabilities();
  if (!DESK_EMBED_ENABLED) return null;
  // Classic phones carry the switch inside the top navigation pill. The
  // floating edge chip is only needed on desktop classic and when returning
  // from a full-screen Win95 session.
  if (!isDesktop && mode === 'classic') return null;
  /** The chip advertises the presentation it would switch to, so it wears that one's icon. */
  const targetMode: DisplayMode = requestedMode === 'win95' ? 'classic' : 'win95';
  const target = TARGET[targetMode];
  return (
    <button
      type="button"
      data-mode-toggle
      onClick={(event) => requestDisplayMode(targetMode, event.currentTarget)}
      aria-label={target.hint}
      title={target.hint}
      data-cursor="none"
      data-mode={mode}
      className="fusion-mode-toggle group fixed right-2 top-1/2 z-[90] flex h-11 min-h-11 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/40 opacity-60 hover:bg-black/70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 sm:right-3"
    >
      <img
        src={targetMode === 'win95' ? '/mhk10-logo.svg' : FAVICON_VARIANTS.classic.icon}
        alt=""
        width={18}
        height={18}
        className={`shrink-0 ${mode === 'win95' ? '' : '[image-rendering:pixelated]'}`}
        aria-hidden="true"
      />
      <span
        className="fusion-mode-toggle__label font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/70 group-hover:text-white"
        aria-hidden="true"
      >
        {target.label}
      </span>
    </button>
  );
});
