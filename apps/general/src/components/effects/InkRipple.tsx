import { useEffect, useRef } from 'react';
import { useVisibleDisplayMode } from '@/hooks/useDisplayMode';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import './ink-ripple.css';

/**
 * 「墨滴」— a click leaves one short ink ring on the classic paper.
 *
 * This is deliberately a single transform/opacity particle per press, created
 * imperatively so pointer input never re-renders the section tree. It exists
 * only on the classic presentation with a fine pointer; the desktop owns its
 * own pointer raster, and touch has its own feedback.
 */
export default function InkRipple() {
  const layerRef = useRef<HTMLDivElement>(null);
  const visibleMode = useVisibleDisplayMode();
  const { finePointer, reducedMotion } = useMediaCapabilities();
  const enabled = visibleMode === 'classic' && finePointer && !reducedMotion;

  useEffect(() => {
    if (!enabled) return;
    const layer = layerRef.current;
    if (!layer) return;
    const timers = new Set<number>();

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest('input, textarea, select, [contenteditable="true"], [data-no-ink-ripple]')
      )
        return;

      const ripple = document.createElement('span');
      ripple.className = 'ink-ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      layer.appendChild(ripple);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        ripple.remove();
      }, 700);
      timers.add(timer);
      ripple.addEventListener(
        'animationend',
        () => {
          window.clearTimeout(timer);
          timers.delete(timer);
          ripple.remove();
        },
        { once: true },
      );
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      layer.replaceChildren();
    };
  }, [enabled]);

  return <div ref={layerRef} className="ink-ripple-layer" aria-hidden="true" />;
}
