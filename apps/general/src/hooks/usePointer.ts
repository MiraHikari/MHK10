import { useEffect } from 'react';
import { motionValue, type MotionValue } from 'motion/react';
import { useMediaCapabilities } from './useMediaCapabilities';

/**
 * Shared, rAF-coalesced pointer stream. Cursor + watermark (and any future
 * subscribers) read the same motion values so the page keeps a single
 * `pointermove` listener.
 *
 * No-ops when `reducedMotion` or `!finePointer` — values stay at rest.
 */

const x = motionValue(0);
const y = motionValue(0);
const normalizedX = motionValue(0);
const normalizedY = motionValue(0);

let subscribers = 0;
let listening = false;
let raf = 0;
let latestX = 0;
let latestY = 0;

function flush() {
  raf = 0;
  x.set(latestX);
  y.set(latestY);
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  normalizedX.set(latestX / width - 0.5);
  normalizedY.set(latestY / height - 0.5);
}

function onPointerMove(event: PointerEvent) {
  latestX = event.clientX;
  latestY = event.clientY;
  if (raf) return;
  raf = requestAnimationFrame(flush);
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // capture 阶段订阅：YARL 缩放插件在 zoom>1 时会对 pointermove 调
  // stopPropagation（bubble 阶段到不了 window），capture 在事件下行时
  // 先触发，不受任何组件 stopPropagation 影响。
  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('pointermove', onPointerMove, { capture: true });
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

export function usePointer(): {
  x: MotionValue<number>;
  y: MotionValue<number>;
  normalizedX: MotionValue<number>;
  normalizedY: MotionValue<number>;
} {
  const { finePointer, reducedMotion } = useMediaCapabilities();
  const active = finePointer && !reducedMotion;

  useEffect(() => {
    if (!active) return;
    subscribers += 1;
    if (subscribers === 1) startListening();
    return () => {
      subscribers -= 1;
      if (subscribers === 0) stopListening();
    };
  }, [active]);

  return { x, y, normalizedX, normalizedY };
}
