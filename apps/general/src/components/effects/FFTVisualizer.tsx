import { useRef, useEffect, useCallback } from 'react';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { sectionAccentValue } from '@/hooks/useSectionAccent';

interface FFTVisualizerProps {
  analyser: AnalyserNode | null;
  playing: boolean;
}

const BAR_COUNT = 5;
const WIDTH = 16;
const HEIGHT = 16;
const GAP = 1;
const BAR_WIDTH = (WIDTH - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
const MIN_HEIGHT = HEIGHT * 0.15;
const DECAY = 0.92;

function drawStaticBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  accent: string,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = accent;
  for (let i = 0; i < BAR_COUNT; i++) {
    const x = (BAR_WIDTH + GAP) * i * dpr;
    const barH = MIN_HEIGHT * dpr;
    ctx.fillRect(x, h - barH, BAR_WIDTH * dpr, barH);
  }
}

export default function FFTVisualizer({ analyser, playing }: FFTVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const accentRef = useRef<string>('#ffffff');
  const rafRef = useRef<number>(0);
  const heightsRef = useRef<number[]>(new Array(BAR_COUNT).fill(MIN_HEIGHT));
  const visibleRef = useRef(true);
  // Reuse frequency buffer across frames to avoid per-frame GC pressure.
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const { reducedMotion } = useMediaCapabilities();

  // Cache the 2D context once and follow the section accent store so the
  // animation loop only reads cached values. Subscribing to the writer's
  // motion value replaces a MutationObserver on `<html style>` that fired
  // (and forced a style recalculation) on every accent animation frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;

    const syncAccent = (value: string) => {
      accentRef.current = value || '#ffffff';
    };
    syncAccent(sectionAccentValue.get());
    return sectionAccentValue.on('change', syncAccent);
  }, []);

  const draw = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = WIDTH * dpr;
    const h = HEIGHT * dpr;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const accent = accentRef.current;

    if (reducedMotion) {
      drawStaticBars(ctx, w, h, dpr, accent);
      return;
    }

    if (!visibleRef.current) return;

    ctx.clearRect(0, 0, w, h);

    const heights = heightsRef.current;

    if (analyser && playing) {
      const binCount = analyser.frequencyBinCount;
      if (!freqDataRef.current || freqDataRef.current.length !== binCount) {
        freqDataRef.current = new Uint8Array(new ArrayBuffer(binCount));
      }
      const data = freqDataRef.current;
      analyser.getByteFrequencyData(data);

      // Pick bins spread across the lower-mid range (most musical content)
      for (let i = 0; i < BAR_COUNT; i++) {
        const binIndex = Math.min(
          Math.floor(((i + 1) * (binCount * 0.6)) / BAR_COUNT),
          binCount - 1,
        );
        const normalized = data[binIndex] / 255;
        const targetHeight = MIN_HEIGHT + normalized * (HEIGHT - MIN_HEIGHT);
        // Smooth rise and fall
        heights[i] =
          heights[i] < targetHeight
            ? heights[i] + (targetHeight - heights[i]) * 0.4
            : heights[i] * DECAY + targetHeight * (1 - DECAY);
      }
    } else {
      // Decay to resting height
      for (let i = 0; i < BAR_COUNT; i++) {
        heights[i] = heights[i] * 0.93 + MIN_HEIGHT * 0.07;
      }
    }

    // Draw bars
    ctx.fillStyle = accent;
    for (let i = 0; i < BAR_COUNT; i++) {
      const x = (BAR_WIDTH + GAP) * i * dpr;
      const barH = heights[i] * dpr;
      ctx.fillRect(x, h - barH, BAR_WIDTH * dpr, barH);
    }

    // Continue loop if playing, or if bars haven't settled yet
    const settled = !playing && heights.every((v) => Math.abs(v - MIN_HEIGHT) < 0.5);
    if (!settled) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [analyser, playing, reducedMotion]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (visibleRef.current && !reducedMotion) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(rafRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [draw, reducedMotion]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (reducedMotion) {
      draw();
      return;
    }
    if (document.visibilityState === 'visible') {
      rafRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, reducedMotion]);

  return <canvas ref={canvasRef} style={{ width: WIDTH, height: HEIGHT, display: 'block' }} />;
}
