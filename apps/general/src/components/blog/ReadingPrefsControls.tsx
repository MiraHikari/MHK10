import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { zIndex } from '@/lib/z-index';
import { hide, shown } from '@/hooks/useSectionAnimations';
import { useDismissable } from '@/hooks/useDismissable';
import { motionDuration, motionEase } from '@/lib/motion';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { useClientFlag } from '@/hooks/useClientFlag';
import {
  LINE_WIDTH_CHAR,
  LINE_WIDTH_PROSE,
  setLineWidth,
  setZenMode,
  useLineWidth,
  useZenMode,
  type LineWidth,
} from '@/lib/blog/reading-prefs';
import {
  disposeSpeech,
  currentProseSelection,
  resumeSpeech,
  speak,
  speechSynthesisSupported,
  stopSpeech,
  useLiveChunk,
  useSpeechState,
} from '@/hooks/blog/useArticleSpeech';
import MaximizeIcon from '~icons/lucide/maximize-2';
import MinimizeIcon from '~icons/lucide/minimize-2';
import VolumeIcon from '~icons/lucide/volume-2';
import SquareIcon from '~icons/lucide/square';

const LINE_WIDTH_OPTIONS: ReadonlyArray<{ value: LineWidth; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'comfortable', label: '舒适' },
  { value: 'wide', label: '宽屏' },
];

/** 专注模式布局折叠时钟：与 ZenBlock / FAB 的 motion 淡出相位共用同一时长。 */
const ZEN_COLLAPSE_MS = Math.round(motionDuration.control * 1000);

/** FAB 的 motion 过渡（reduced 档由 MotionConfig / 于调用处归零）。 */
const ZEN_FAB_TRANSITION = { duration: motionDuration.control, ease: motionEase } as const;

/**
 * 文章阅读控件（渲染在 `.article-actions` 粘性顶栏右侧）：
 *  - 专注模式：chrome 区块的淡出/聚焦由 ZenBlock（motion）承接，本组件
 *    只持一个折叠时钟——进入时淡出相位结束后才挂 `reading-zen`（布局折叠），
 *    退出时立即移除（布局先恢复，chrome 从隐藏态聚焦回来）；「退出专注」
 *    FAB 经 portal + AnimatePresence 条件挂载。
 *  - 行宽三档：同一偏好的响应式解释——桌面端经 `--article-reading-width`
 *    驱动网格列宽（舒适档不设变量，回退 70ch），窄视口改经
 *    `--article-prose-size` / `--article-prose-line` 表达阅读密度。
 *  - 朗读：speaking 停止、paused 继续、idle 朗读选区或全文。
 */
export default function ReadingPrefsControls() {
  const zen = useZenMode();
  const lineWidth = useLineWidth();
  const speechState = useSpeechState();
  const liveChunk = useLiveChunk();
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const widthMenuRef = useRef<HTMLDivElement>(null);
  const ttsSupported = useClientFlag(speechSynthesisSupported);
  const readSelectionRef = useRef<string | null>(null);
  const { reducedMotion } = useMediaCapabilities();
  const reducedMotionRef = useRef(reducedMotion);
  /** 首挂载直接同步持久态，不播进出场（直链携带 reading-zen 进来时避免闪动）。 */
  const zenHydratedRef = useRef(false);
  const zenTimersRef = useRef<number[]>([]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const root = document.documentElement;
    zenTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    zenTimersRef.current = [];

    if (!zenHydratedRef.current) {
      zenHydratedRef.current = true;
      root.classList.toggle('reading-zen', zen);
      return;
    }

    const collapseMs = reducedMotionRef.current ? 0 : ZEN_COLLAPSE_MS;
    if (zen) {
      // 进入：ZenBlock 淡出相位结束后再折叠布局（display:none + 网格收拢）。
      zenTimersRef.current.push(
        window.setTimeout(() => {
          root.classList.add('reading-zen');
        }, collapseMs),
      );
    } else {
      // 退出：立即恢复布局，chrome 从隐藏态聚焦回来；宽度形变由 CSS 过渡承接。
      root.classList.remove('reading-zen');
    }
  }, [zen]);

  // 离开文章（卸载）时清理折叠时钟与朗读。
  useEffect(
    () => () => {
      zenTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      zenTimersRef.current = [];
      document.documentElement.classList.remove('reading-zen');
      disposeSpeech();
    },
    [],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (lineWidth === 'comfortable') {
      root.style.removeProperty('--article-reading-width');
    } else {
      root.style.setProperty('--article-reading-width', `${LINE_WIDTH_CHAR[lineWidth]}ch`);
    }
    const prose = LINE_WIDTH_PROSE[lineWidth];
    root.style.setProperty('--article-prose-size', prose.size);
    root.style.setProperty('--article-prose-line', String(prose.lineHeight));
    return () => {
      root.style.removeProperty('--article-reading-width');
      root.style.removeProperty('--article-prose-size');
      root.style.removeProperty('--article-prose-line');
    };
  }, [lineWidth]);

  // 行宽菜单外部点击 / Escape 关闭。
  useDismissable(widthMenuRef, widthMenuOpen, () => setWidthMenuOpen(false));

  const onReadClick = () => {
    if (speechState === 'speaking') stopSpeech();
    else if (speechState === 'paused') resumeSpeech();
    else speak(readSelectionRef.current ?? undefined);
    readSelectionRef.current = null;
  };

  return (
    <>
      <div className="article-read-prefs">
        {/* 阅读胶囊：行宽 / 专注 / 朗读收进同一容器，与分享胶囊同款分隔 */}
        <div className="article-tool-cluster">
          <div className="article-read-prefs__width" ref={widthMenuRef}>
            <button
              type="button"
              className="article-tool-button"
              aria-expanded={widthMenuOpen}
              aria-haspopup="menu"
              onClick={() => setWidthMenuOpen((value) => !value)}
              data-cursor="LINE WIDTH"
            >
              <span className="article-read-prefs__aa" aria-hidden="true">
                Aa
              </span>
              <span className="article-tool-button__label">行宽</span>
            </button>
            {widthMenuOpen ? (
              <div className="article-read-prefs__menu" role="menu" aria-label="选择行宽">
                {LINE_WIDTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    className={lineWidth === option.value ? 'is-active' : undefined}
                    onClick={() => {
                      setLineWidth(option.value);
                      setWidthMenuOpen(false);
                    }}
                  >
                    <span className="article-read-prefs__value">
                      {LINE_WIDTH_CHAR[option.value]}ch
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="article-tool-button"
            aria-pressed={zen}
            onClick={() => setZenMode(!zen)}
            data-cursor="ZEN"
          >
            {zen ? (
              <MinimizeIcon width={13} height={13} />
            ) : (
              <MaximizeIcon width={13} height={13} />
            )}
            <span className="article-tool-button__label">{zen ? '退出专注' : '专注'}</span>
          </button>
          <button
            type="button"
            className="article-tool-button"
            onClick={onReadClick}
            onPointerDown={() => {
              readSelectionRef.current = currentProseSelection();
            }}
            disabled={!ttsSupported}
            aria-label={
              speechState === 'speaking'
                ? '停止朗读'
                : speechState === 'paused'
                  ? '继续朗读'
                  : '朗读文章'
            }
            data-cursor={speechState === 'speaking' ? 'STOP' : 'READ'}
          >
            {speechState === 'speaking' ? (
              <SquareIcon width={13} height={13} />
            ) : (
              <VolumeIcon width={13} height={13} />
            )}
            <span className="article-tool-button__label">
              {speechState === 'speaking' ? '停止' : speechState === 'paused' ? '继续' : '朗读'}
            </span>
          </button>
        </div>
        {speechState === 'speaking' && liveChunk ? (
          <span
            className="article-read-prefs__tts-progress"
            aria-live="polite"
            title={`正在朗读第 ${liveChunk.index + 1} 段，共 ${liveChunk.total} 段`}
          >
            {liveChunk.index + 1}/{liveChunk.total}
          </span>
        ) : null}
      </div>
      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {zen && (
                <motion.button
                  type="button"
                  className="zen-exit-fab"
                  onClick={() => setZenMode(false)}
                  data-cursor="EXIT ZEN"
                  style={{ zIndex: zIndex.mobileTocFab }}
                  initial={false}
                  animate={shown}
                  exit={hide}
                  transition={reducedMotion ? { duration: 0 } : ZEN_FAB_TRANSITION}
                >
                  <MinimizeIcon width={13} height={13} />
                  退出专注
                </motion.button>
              )}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
