import { useEffect, useLayoutEffect } from 'react';
import { animate, motionValue, useMotionValue } from 'motion/react';
import { deriveAccent } from '@/lib/accent';
import { rotateHue } from '@/lib/palette';
import { motionDuration, motionEase, type MotionLevel } from '@/lib/motion';

/**
 * Publishes the active section's identity colours as document-level CSS
 * variables (`--section-accent`, `--section-accent-soft`, plus derived
 * `--section-accent-ink` / `--section-accent-on`).
 *
 * They live on `documentElement` rather than a React subtree because global
 * stylesheet rules (`::selection`, scrollbar, target highlight) and the
 * standalone `Cursor` island outside `App` both consume them.
 *
 * In lucid mode the accent keeps drifting through the hue wheel instead of
 * settling on the section colour.
 */

const ACCENT_VAR = '--section-accent';
const ACCENT_SOFT_VAR = '--section-accent-soft';
const ACCENT_INK_VAR = '--section-accent-ink';
const ACCENT_ON_VAR = '--section-accent-on';
const LUCID_CYCLE_SECONDS = 18;
const LUCID_STOPS = 7;

/**
 * 当前 `--section-accent` 的模块级镜像（含过渡 / 流光动画的逐帧插值）。
 * 装饰层（自定义光标、FFT 频谱）必须每帧取色，但不能每帧
 * `getComputedStyle`——那会在指针帧里强制一次样式重算。写入方
 * `writeAccent` 是唯一事实来源，订阅者零成本读取。
 */
export const sectionAccentValue = motionValue('');

function hueCycle(hex: string) {
  return Array.from({ length: LUCID_STOPS + 1 }, (_, index) =>
    rotateHue(hex, (360 / LUCID_STOPS) * index),
  );
}

export function useSectionAccent(
  accent: string,
  accentSoft: string,
  isDark: boolean,
  motionLevel: MotionLevel,
  lucid: boolean,
) {
  const accentValue = useMotionValue(accent);
  const accentSoftValue = useMotionValue(accentSoft);

  // Layout effect so a direct load of e.g. /skills is already violet on first
  // paint instead of flashing the stylesheet's brand-blue fallback.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const writeDerived = (base: string, soft: string) => {
      const derived = deriveAccent(base, soft, isDark);
      root.style.setProperty(ACCENT_INK_VAR, derived.ink);
      root.style.setProperty(ACCENT_ON_VAR, derived.on);
    };
    const writeAccent = (value: string) => {
      root.style.setProperty(ACCENT_VAR, value);
      sectionAccentValue.set(value);
      writeDerived(value, accentSoftValue.get());
    };
    const writeSoft = (value: string) => {
      root.style.setProperty(ACCENT_SOFT_VAR, value);
      writeDerived(accentValue.get(), value);
    };

    writeAccent(accentValue.get());
    writeSoft(accentSoftValue.get());
    writeDerived(accentValue.get(), accentSoftValue.get());
    const unsubscribeAccent = accentValue.on('change', writeAccent);
    const unsubscribeSoft = accentSoftValue.on('change', writeSoft);
    return () => {
      unsubscribeAccent();
      unsubscribeSoft();
    };
  }, [accentValue, accentSoftValue, isDark]);

  useEffect(() => {
    const duration = motionLevel === 'reduced' ? 0 : motionDuration.accentShift;
    const options = { duration, ease: motionEase } as const;

    if (!lucid || motionLevel === 'reduced') {
      const controls = [
        animate(accentValue, accent, options),
        animate(accentSoftValue, accentSoft, options),
      ];
      return () => controls.forEach((control) => control.stop());
    }

    const cycleOptions = {
      duration: LUCID_CYCLE_SECONDS,
      ease: 'linear',
      repeat: Infinity,
    } as const;
    const controls = [
      animate(accentValue, hueCycle(accent), cycleOptions),
      animate(accentSoftValue, hueCycle(accentSoft), cycleOptions),
    ];
    return () => controls.forEach((control) => control.stop());
  }, [accent, accentSoft, accentValue, accentSoftValue, lucid, motionLevel]);
}
