import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { useVisibleDisplayMode } from '@/hooks/useDisplayMode';
import { usePointer } from '@/hooks/usePointer';
import { sectionAccentValue } from '@/hooks/useSectionAccent';
import './cursor.css';

/**
 * Fallback for the unlikely frame before `useSectionAccent` publishes its
 * layout-effect write (e.g. the App island failed to hydrate). Reads the
 * stylesheet fallback once instead of per pointer frame; `:root` always has
 * a token.
 */
const readSectionAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--section-accent').trim();

/**
 * The last pointer position survives presentation switches and remounts.
 *
 * Browsers do not report a pointer position until the pointer moves, so a
 * visitor who lands on the page (or returns from the desktop) without moving
 * the mouse would otherwise get a hidden native cursor and an unpainted custom
 * one. Remembering the last real position lets the custom cursor paint
 * immediately instead of waiting for the first move.
 */
let lastPointer: { x: number; y: number } | null = null;

export default function Cursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const { finePointer, reducedMotion } = useMediaCapabilities();
  const visibleDisplayMode = useVisibleDisplayMode();
  // The desktop owns its own pointer raster. Keeping the site cursor mounted
  // over the iframe freezes it at the last host mousemove and paints a second
  // cursor above the desktop; release the host cursor with the presentation.
  const hasFinePointer = finePointer && !reducedMotion && visibleDisplayMode === 'classic';
  const { x, y } = usePointer();
  const [mounted, setMounted] = useState(false);
  const [positioned, setPositioned] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!hasFinePointer) return;
    // A known position from an earlier presentation is enough to paint now.
    if (lastPointer) {
      x.set(lastPointer.x);
      y.set(lastPointer.y);
      setPositioned(true);
    }
    const markPositioned = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      lastPointer = { x: event.clientX, y: event.clientY };
      // Seed the stream so a press without a preceding move still paints the
      // cursor at the real position instead of the resting origin.
      x.set(event.clientX);
      y.set(event.clientY);
      setPositioned(true);
    };
    window.addEventListener('pointermove', markPositioned, { passive: true, capture: true });
    window.addEventListener('pointerdown', markPositioned, { passive: true, capture: true });
    window.addEventListener('pointerenter', markPositioned, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointermove', markPositioned, { capture: true });
      window.removeEventListener('pointerdown', markPositioned, { capture: true });
      window.removeEventListener('pointerenter', markPositioned, { capture: true });
    };
  }, [hasFinePointer, x, y]);

  useEffect(() => {
    const root = document.documentElement;
    if (!mounted || !hasFinePointer || !positioned) {
      root.classList.remove('custom-cursor-active');
      return;
    }
    root.classList.add('custom-cursor-active');
    return () => root.classList.remove('custom-cursor-active');
  }, [mounted, hasFinePointer, positioned]);

  useEffect(() => {
    if (!hasFinePointer) return;

    const cursor = cursorRef.current;
    if (!cursor) return;

    let pressed = false;
    let visible = false;
    let lastTarget: EventTarget | null = null;
    let paintScheduled = false;

    // Live accent mirror: a store read, not a forced style recalculation —
    // renderCursor runs once per coalesced pointer frame.
    const sectionAccent = () => sectionAccentValue.get() || readSectionAccent();

    const renderCursor = () => {
      const mouseX = x.get();
      const mouseY = y.get();
      const element = lastTarget instanceof Element ? lastTarget : null;
      const interactive = element?.closest<HTMLElement>(
        'a,button,[role="button"],input,textarea,select,[data-cursor],.interactive',
      );
      // `data-cursor="none"` keeps the small ink dot but suppresses the label
      // chip, so a compact control can show its own expanded target name.
      const cursorHint = interactive?.dataset.cursor;
      const unlabeled = cursorHint === 'none';
      let label = unlabeled
        ? ''
        : cursorHint ||
          interactive?.getAttribute('aria-label') ||
          interactive?.getAttribute('title') ||
          '';
      if (
        !label &&
        !unlabeled &&
        interactive &&
        (interactive.tagName === 'A' || interactive.tagName === 'BUTTON')
      ) {
        const text = (interactive.textContent || '').trim();
        if (text) {
          const isCJK = /[一-鿿]/.test(text);
          label = isCJK ? text.slice(0, 2) : text.slice(0, 8);
        } else {
          label = interactive.tagName === 'A' ? 'GOTO' : 'CLICK';
        }
      }
      const normalizedLabel = label ? label.split(/[\s:：]/)[0].toUpperCase() : '';
      const accent =
        normalizedLabel === 'DRAG'
          ? '#EAB308'
          : normalizedLabel === 'SEARCH'
            ? '#6CE5E8'
            : sectionAccent();
      const chip = interactive && !unlabeled ? interactive : null;
      const chipWidth = chip ? Math.min(Math.max(64, normalizedLabel.length * 12 + 22), 128) : 14;
      const cursorWidth = `${chipWidth}px`;

      cursor.style.width = cursorWidth;
      cursor.style.height = chip ? '28px' : '14px';
      cursor.style.borderColor = chip ? accent : '#ffffff';
      cursor.style.backgroundColor = accent;
      cursor.style.mixBlendMode = chip ? 'normal' : 'difference';
      cursor.style.boxShadow = chip
        ? `0 10px 30px color-mix(in srgb, ${accent} 33%, transparent)`
        : 'none';
      if (labelRef.current) {
        labelRef.current.textContent = normalizedLabel || '';
        labelRef.current.style.opacity = chip ? '1' : '0';
      }

      // Keep the pointer itself clear: the label rides to the lower-right, and
      // folds back inward near the viewport edge so it never falls off-screen.
      const offsetX = chip
        ? Math.max(4, Math.min(14, window.innerWidth - mouseX - chipWidth - 8))
        : 0;
      const offsetY = chip ? Math.max(4, Math.min(14, window.innerHeight - mouseY - 36)) : 0;
      cursor.style.transform = chip
        ? `translate3d(${mouseX}px, ${mouseY}px, 0) translate(${offsetX}px, ${offsetY}px) scale(${pressed ? 0.88 : 1})`
        : `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%) scale(${pressed ? 0.88 : 1})`;
    };

    const scheduleRender = () => {
      if (!visible) {
        visible = true;
        cursor.style.opacity = '1';
      }
      // x + y both fire in the same flush; coalesce to one paint.
      if (paintScheduled) return;
      paintScheduled = true;
      queueMicrotask(() => {
        paintScheduled = false;
        renderCursor();
      });
    };

    const handleMouseEnter = () => {
      visible = true;
      cursor.style.opacity = '1';
    };

    const handleMouseLeave = () => {
      visible = false;
      cursor.style.opacity = '0';
    };

    const handleMouseDown = () => {
      pressed = true;
      renderCursor();
    };

    const handleMouseUp = () => {
      pressed = false;
      renderCursor();
    };

    const handleMouseOver = (e: MouseEvent) => {
      lastTarget = e.target;
      renderCursor();
    };

    const unsubscribeX = x.on('change', scheduleRender);
    const unsubscribeY = y.on('change', scheduleRender);

    window.addEventListener('mouseenter', handleMouseEnter);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseover', handleMouseOver);

    // Returning from the desktop keeps the last known position: paint it now so
    // the custom cursor is visible before the next move.
    if (lastPointer) scheduleRender();

    return () => {
      unsubscribeX();
      unsubscribeY();
      window.removeEventListener('mouseenter', handleMouseEnter);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseover', handleMouseOver);
    };
  }, [hasFinePointer, x, y]);

  // Keep a React element during SSR/initial render so Astro can identify the
  // renderer without falling through to MDX's generic function probe.
  if (!hasFinePointer || !mounted) return <span hidden aria-hidden="true" />;

  return createPortal(
    <div
      ref={cursorRef}
      className="pf-cursor fixed left-0 top-0 flex items-center justify-center border pointer-events-none z-[10000] opacity-0"
      style={{
        transform: 'translate3d(-100px, -100px, 0) translate(-50%, -50%)',
      }}
    >
      <span
        ref={labelRef}
        className="pf-cursor__label whitespace-nowrap font-mono text-micro font-bold uppercase tracking-eyebrow opacity-0"
      />
    </div>,
    document.body,
  );
}
