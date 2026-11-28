import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type * as React from 'react';
import type * as Yarl from 'yet-another-react-lightbox';
import './lightbox/lightbox.css';
import { acquireInputPause, releaseInputPause } from '@/hooks/useFullpageNavigation';
import { prefetchImage } from '@/lib/images/prefetch';
import type { LightboxYarlRootProps } from './lightbox/index';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { zIndex } from '@/lib/z-index';

/**
 * 站点灯箱壳 — 由 yet-another-react-lightbox（YARL）驱动。
 *
 * 本文件只保留壳职责：
 * - 对外 props 契约（items / index / onClose / onNavigate / variant）与
 *   LightboxItem 类型，消费方零改动；
 * - 首次打开时才动态加载 YARL 子树（./lightbox/：YARL 核心、官方插件、
 *   styles.css 一并移出首屏主包），App 在 contentReady 后已空闲预载
 *   YARL 核心，打开时近乎零等待；
 * - 打开期间暂停 fullpage 输入接管、Home/End 跳转经 controller ref 补齐、
 *   打开时预取当前条目原图（W2.5）。
 *
 * YARL 内建控件的皮肤在同目录 lightbox/lightbox.css（.pf-lightbox 作用域）。
 */

import type { LightboxItem } from './lightbox/types';
export type { LightboxItem };

interface LightboxProps {
  readonly items: readonly LightboxItem[];
  readonly index: number | null;
  readonly onClose: () => void;
  readonly onNavigate: (idx: number) => void;
  /** Visual variant: gallery (media-first) or project (detail-first). */
  readonly variant?: 'gallery' | 'project';
}

export default function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
  variant = 'gallery',
}: LightboxProps) {
  const [YarlRoot, setYarlRoot] = useState<React.ComponentType<LightboxYarlRootProps> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const pendingRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Yarl.ControllerRef>(null);
  const isOpen = index !== null && index >= 0 && index < items.length;
  useFocusTrap(pendingRef, { active: isOpen && !YarlRoot, onEscape: onClose });

  // 加载期间和失败时保留可关闭的界面；模块加载失败后通过整页刷新重试。
  useEffect(() => {
    if (index === null || YarlRoot) return;
    setLoadFailed(false);
    let cancelled = false;
    void import('./lightbox/index')
      .then((mod) => {
        if (cancelled) return;
        setYarlRoot(() => mod.LightboxYarlRoot);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        console.warn('[lightbox] 图片查看器加载失败', error);
      });
    return () => {
      cancelled = true;
    };
  }, [index, YarlRoot]);

  // 打开时预取当前条目原图（放大 / FULL RES 下载更顺）；省流 / 2G 由
  // prefetchImage 内置守卫跳过。downloadSrc 为可选字段，空则跳过。
  useEffect(() => {
    if (index === null) return;
    const item = items[index];
    if (item?.downloadSrc) prefetchImage(item.downloadSrc);
  }, [index, items]);

  // 有的调用方在 onClose 里同步清空 items（文章页释放增强数据）；
  // 退场动画期间沿用最后一帧非空 items，避免画面空闪 / 插件中途卸载。
  const lastItemsRef = useRef(items);
  if (items.length > 0) lastItemsRef.current = items;
  const liveItems = items.length > 0 ? items : lastItemsRef.current;
  const hasSiblings = liveItems.length > 1;

  // 关闭时 index 先归 null；退场动画期间沿用最后一次的索引，画面不跳变。
  const lastIndexRef = useRef(0);
  useEffect(() => {
    if (isOpen && index !== null) lastIndexRef.current = index;
  }, [isOpen, index]);
  const rawIndex = isOpen && index !== null ? index : lastIndexRef.current;
  const displayIndex = Math.max(0, Math.min(rawIndex, liveItems.length - 1));

  // 灯箱打开期间暂停 fullpage 的滚轮 / 键盘 / 触摸接管。
  useEffect(() => {
    if (!isOpen) return;
    const pauseToken = acquireInputPause('lightbox');
    return () => releaseInputPause(pauseToken);
  }, [isOpen]);

  // YARL 未内建 Home / End 跳转，经 controller ref 补齐（沿用滑动动画）。
  useEffect(() => {
    if (!isOpen || !hasSiblings) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Home' && e.key !== 'End') return;
      const state = controllerRef.current?.getLightboxState();
      if (!state) return;
      e.preventDefault();
      const last = state.slides.length - 1;
      if (e.key === 'Home' && state.currentIndex > 0) {
        controllerRef.current?.prev({ count: state.currentIndex });
      } else if (e.key === 'End' && state.currentIndex < last) {
        controllerRef.current?.next({ count: last - state.currentIndex });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, hasSiblings]);

  return YarlRoot ? (
    <YarlRoot
      items={liveItems}
      open={isOpen}
      index={displayIndex}
      onClose={onClose}
      onNavigate={onNavigate}
      variant={variant}
      controllerRef={controllerRef}
    />
  ) : isOpen ? (
    createPortal(
      <div
        ref={pendingRef}
        role="dialog"
        aria-modal="true"
        aria-label="图片查看器"
        className="fixed inset-0 flex items-center justify-center bg-neutral-950/95 p-6 text-ink-on-dark"
        style={{ zIndex: zIndex.lightbox }}
      >
        <div className="w-full max-w-sm border border-white/20 p-6">
          <p role="status" className="text-sm leading-relaxed">
            {loadFailed ? '图片查看器未能加载，请重新加载页面。' : '正在打开图片查看器…'}
          </p>
          <div className="mt-5 flex gap-3">
            {loadFailed && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-11 border border-accent-base px-4 text-sm text-accent-ink"
              >
                重新加载
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 border border-white/20 px-4 text-sm"
            >
              关闭
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  ) : null;
}
