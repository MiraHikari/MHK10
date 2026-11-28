import { useEffect, useRef, useState } from 'react';
import { animate, type AnimationPlaybackControls } from 'motion';
import { useMediaCapabilities } from './useMediaCapabilities';

export function useCountUp(
  target: number,
  duration: number = 1.2,
  trigger?: boolean,
): {
  ref: React.RefObject<HTMLSpanElement | null>;
  value: number;
} {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const { reducedMotion } = useMediaCapabilities();

  useEffect(() => {
    if (reducedMotion) {
      animRef.current?.stop();
      setValue(target);
      return;
    }

    const run = () => {
      // Spring-driven count with a tiny overshoot, then settle.
      const overshoot = target + Math.max(1, Math.round(target * 0.03));
      animRef.current = animate(0, overshoot, {
        type: 'spring',
        stiffness: 120,
        damping: 18,
        mass: 0.8,
        onUpdate: (latest) => setValue(Math.round(Math.min(latest, overshoot))),
        onComplete: () => setValue(target),
      });
    };

    if (trigger !== undefined) {
      if (trigger) run();
      else {
        animRef.current?.stop();
        setValue(0);
      }
      return () => animRef.current?.stop();
    }

    const element = ref.current;
    if (!element || hasAnimated.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      animRef.current?.stop();
    };
  }, [target, duration, trigger, reducedMotion]);

  return { ref, value };
}
