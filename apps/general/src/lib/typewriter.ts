import { typewriterScore } from '@/lib/motion';

export interface TypewriterPlayback {
  cancel: () => void;
}

function createPlayback(
  run: (schedule: (fn: () => void, ms: number) => void) => void,
): TypewriterPlayback {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const schedule = (fn: () => void, ms: number): void => {
    timer = setTimeout(() => {
      if (!cancelled) fn();
    }, ms);
  };

  run(schedule);

  return {
    cancel(): void {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/**
 * Backspace `from` one glyph at a time. First glyph drops on the call tick
 * so erase stays ahead of the bridge (matches typewriterEraseDuration).
 */
export function playTypewriterErase(
  from: string,
  onFrame: (displayed: string) => void,
): TypewriterPlayback {
  return createPlayback((schedule) => {
    let current = from;

    const step = (): void => {
      if (current.length === 0) return;
      current = current.slice(0, -1);
      onFrame(current);
      if (current.length > 0) {
        schedule(step, typewriterScore.eraseMs);
      }
    };

    step();
  });
}

/**
 * Type `to` after typeDelayMs, then one glyph per typeMs.
 * Starts from an empty frame (matches typewriterTypeDuration).
 */
export function playTypewriterType(
  to: string,
  onFrame: (displayed: string) => void,
): TypewriterPlayback {
  onFrame('');

  if (to.length === 0) {
    return { cancel(): void {} };
  }

  return createPlayback((schedule) => {
    let index = 0;

    const step = (): void => {
      index += 1;
      onFrame(to.slice(0, index));
      if (index < to.length) {
        schedule(step, typewriterScore.typeMs);
      }
    };

    schedule(step, typewriterScore.typeDelayMs);
  });
}
