import { useEffect, useRef, type RefObject } from 'react';
import { SECTIONS } from '@/lib/sections';
import { isInputPaused } from './inputPause';
import type { SectionScroller } from './sectionScroller';
import { touchDistanceThreshold, touchTimeThreshold, wheelResetMs, wheelThreshold } from './timing';

interface UseFullpageInputHandlersArgs {
  readonly lenisRef: RefObject<SectionScroller | null>;
  readonly activeIndexRef: RefObject<number>;
  readonly activeArticleRef: RefObject<string | null>;
  readonly lockedRef: RefObject<boolean>;
  /** False until BootLoader finishes — blocks section nav under the mask. */
  readonly contentReadyRef: RefObject<boolean>;
  readonly navigateToSection: (targetIndex: number, syncHistory?: boolean) => void;
  readonly navigateBackFromArticle: (syncHistory?: boolean) => void;
}

export function useFullpageInputHandlers({
  lenisRef,
  activeIndexRef,
  activeArticleRef,
  lockedRef,
  contentReadyRef,
  navigateToSection,
  navigateBackFromArticle,
}: UseFullpageInputHandlersArgs) {
  const wheelAccum = useRef(0);
  const lastWheelTime = useRef(0);
  const wasLocked = useRef(false);
  const wheelCooldownUntil = useRef(0);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      // Ctrl+滚轮是浏览器缩放，Meta 同理 —— 不劫持系统手势。
      if (event.ctrlKey || event.metaKey) return;
      if (isInputPaused() || !contentReadyRef.current) return;

      let delta = event.deltaY;
      if (event.deltaMode === 1) {
        delta *= 40;
      } else if (event.deltaMode === 2) {
        delta *= window.innerHeight;
      }

      const now = Date.now();
      if (now - lastWheelTime.current > wheelResetMs) {
        wheelAccum.current = 0;
      }
      lastWheelTime.current = now;

      // Article reading mode keeps native scrolling, including while an
      // article transition is settling.
      if (activeArticleRef.current) return;

      // A wheel gesture must advance at most one section. Do not accumulate
      // momentum while a transition is running or enqueue it for later.
      if (lockedRef.current) {
        wasLocked.current = true;
        wheelAccum.current = 0;
        return;
      }

      // Drop the first momentum events after the transition unlocks. Without
      // this guard, the tail of the same gesture can immediately start the
      // next section transition.
      if (wasLocked.current) {
        wasLocked.current = false;
        wheelAccum.current = 0;
        wheelCooldownUntil.current = now + wheelResetMs;
        return;
      }

      if (now < wheelCooldownUntil.current) {
        wheelAccum.current = 0;
        return;
      }

      const lenis = lenisRef.current;
      if (!lenis) return;

      const atTop = lenis.scroll <= 0;
      const atBottom = lenis.limit === 0 || lenis.scroll >= lenis.limit - 2;

      if (delta > 0 && atBottom) {
        wheelAccum.current += delta;
        if (wheelAccum.current > wheelThreshold) {
          wheelAccum.current = 0;
          navigateToSection(activeIndexRef.current + 1);
        }
        return;
      }

      if (delta < 0 && atTop) {
        wheelAccum.current += delta;
        if (wheelAccum.current < -wheelThreshold) {
          wheelAccum.current = 0;
          navigateToSection(activeIndexRef.current - 1);
        }
        return;
      }

      wheelAccum.current = 0;
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [
    activeIndexRef,
    activeArticleRef,
    contentReadyRef,
    lenisRef,
    lockedRef,
    navigateToSection,
    navigateBackFromArticle,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Ctrl/Alt/Meta 组合键属于浏览器与系统快捷键（Ctrl+Home、缩放等），不劫持。
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'a, button, input, textarea, select, summary, [contenteditable="true"], [role="button"], [role="link"], [role="dialog"], [role="option"]',
        )
      ) {
        return;
      }
      if (!contentReadyRef.current || isInputPaused()) return;

      const index = activeIndexRef.current;

      if (activeArticleRef.current) {
        // Article reading keeps native scrolling. Escape remains an explicit
        // shortcut back to the list; boundary scrolling never ejects readers.
        if (event.key === 'Escape') {
          event.preventDefault();
          navigateBackFromArticle();
        }
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        navigateToSection(index + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        navigateToSection(index - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        navigateToSection(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        navigateToSection(SECTIONS.length - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeIndexRef,
    activeArticleRef,
    lenisRef,
    lockedRef,
    navigateToSection,
    navigateBackFromArticle,
  ]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startedWhileLocked = false;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches.item(0);
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      startedWhileLocked = lockedRef.current;
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!contentReadyRef.current || isInputPaused()) return;
      const touch = event.changedTouches.item(0);
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = startY - touch.clientY;
      const absDeltaY = Math.abs(deltaY);
      const deltaTime = Date.now() - startTime;

      if (
        absDeltaY < touchDistanceThreshold ||
        deltaTime > touchTimeThreshold ||
        deltaX > absDeltaY * 0.5
      ) {
        return;
      }

      if (activeArticleRef.current) return;

      if (startedWhileLocked || lockedRef.current) {
        return;
      }

      const lenis = lenisRef.current;
      if (!lenis) return;

      const atTop = lenis.scroll <= 0;
      const atBottom = lenis.limit === 0 || lenis.scroll >= lenis.limit - 2;

      if (deltaY > 0 && atBottom) {
        navigateToSection(activeIndexRef.current + 1);
      } else if (deltaY < 0 && atTop) {
        navigateToSection(activeIndexRef.current - 1);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [
    activeIndexRef,
    activeArticleRef,
    contentReadyRef,
    lenisRef,
    lockedRef,
    navigateToSection,
    navigateBackFromArticle,
  ]);
}
