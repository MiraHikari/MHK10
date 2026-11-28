import { useEffect, useRef } from 'react';
import { motionValue } from 'motion/react';

const VELOCITY_THRESHOLD = 0.001;
const PULSE_THRESHOLD = 0.001;

/**
 * 「墨与光的呼吸」——低通映射近期滚轮活动到 0.85–1.2 的呼吸倍率。
 *
 * 值发布到模块级 `breathValue`（motion value）：DarkVeil 的渲染循环直接
 * 订阅它写入 liveRef，不再经 React state 逐帧驱动整个 App 岛重渲染
 * （原先 `setBreath` 在 rAF 循环里 60fps setState，wheel 后 ~0.5s 内
 * 全树重渲染）。rAF 循环在速度与脉冲都衰减到阈值后休眠，wheel / pulse /
 * 可见性恢复时唤醒。
 */

/** 模块级呼吸倍率：DarkVeil 经 `on('change')` 订阅。 */
export const breathValue = motionValue(1);

function setBreath(next: number): void {
  // 保留原 hook 的阈值防抖：微差不入流，避免无意义通知。
  if (Math.abs(breathValue.get() - next) > 0.01) breathValue.set(next);
}

export function useScrollBreath(enabled: boolean, pulse = false) {
  const velocityRef = useRef(0);
  const pulseRef = useRef(0);
  const frameRef = useRef(0);
  const asleepRef = useRef(false);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) {
      setBreath(1);
      return;
    }

    const tick = () => {
      velocityRef.current *= 0.92;
      if (pulseRef.current > 0) pulseRef.current *= 0.88;
      const next = 0.85 + velocityRef.current * 0.28 + pulseRef.current * 0.2;
      setBreath(next);

      if (velocityRef.current < VELOCITY_THRESHOLD && pulseRef.current < PULSE_THRESHOLD) {
        // Nothing left to animate — hibernate until the next wheel/pulse.
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
        asleepRef.current = true;
      } else {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (!asleepRef.current) return;
      asleepRef.current = false;
      frameRef.current = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    const onWheel = (event: WheelEvent) => {
      velocityRef.current = Math.min(1, velocityRef.current + Math.abs(event.deltaY) / 800);
      wake();
    };
    window.addEventListener('wheel', onWheel, { passive: true });

    const onVisibility = () => {
      if (document.hidden) {
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = 0;
          asleepRef.current = true;
        }
      } else {
        wake();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      asleepRef.current = true;
      setBreath(1);
    };
  }, [enabled]);

  useEffect(() => {
    if (pulse && enabled) {
      pulseRef.current = 1;
      wakeRef.current();
    }
  }, [pulse, enabled]);
}
