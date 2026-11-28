import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import {
  transitionScore,
  typewriterEraseDuration,
  typewriterPhaseDelays,
  typewriterScore,
  typewriterTypeDuration,
} from '@/lib/motion';
import { playTypewriterErase, playTypewriterType } from '@/lib/typewriter';

describe('typewriter durations', () => {
  it('scales erase time by remaining glyphs after the immediate first drop', () => {
    expect(typewriterEraseDuration('')).toBe(0);
    expect(typewriterEraseDuration('A')).toBe(0);
    expect(typewriterEraseDuration('ABOUT')).toBe(4 * typewriterScore.eraseMs);
    expect(typewriterEraseDuration('GALLERY')).toBe(6 * typewriterScore.eraseMs);
  });

  it('includes the enter delay only when there is something to type', () => {
    expect(typewriterTypeDuration('')).toBe(0);
    expect(typewriterTypeDuration('BLOG')).toBe(
      typewriterScore.typeDelayMs + 4 * typewriterScore.typeMs,
    );
    expect(typewriterTypeDuration('ENGINEERING')).toBe(
      typewriterScore.typeDelayMs + 11 * typewriterScore.typeMs,
    );
  });

  it('projects orchestrator waits from the same score (incl. mount skew)', () => {
    const delays = typewriterPhaseDelays('ABOUT', 'BLOG');
    expect(delays.erase).toBe(typewriterEraseDuration('ABOUT') + typewriterScore.mountSkewMs);
    expect(delays.gap).toBe(typewriterScore.gapMs);
    expect(delays.type).toBe(typewriterTypeDuration('BLOG'));
    expect(delays.settle).toBe(typewriterScore.settleMs);
  });

  it('budgets long watermarks past exitPose so late effect mounts still finish erase', () => {
    const eraseWait = typewriterEraseDuration('ENGINEERING') + typewriterScore.mountSkewMs;
    expect(eraseWait).toBeGreaterThan(transitionScore.exitPose);
    // mountSkew must cover multi-frame GPU delay beyond a single rAF (~16ms).
    expect(typewriterScore.mountSkewMs).toBeGreaterThanOrEqual(48);
  });
});

describe('typewriter playback cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('erases with an immediate first backspace then eraseMs steps', () => {
    const frames: string[] = [];
    playTypewriterErase('HI', (value) => frames.push(value));

    expect(frames).toEqual(['H']);
    vi.advanceTimersByTime(typewriterScore.eraseMs);
    expect(frames).toEqual(['H', '']);
  });

  it('types after typeDelayMs then one glyph per typeMs', () => {
    const frames: string[] = [];
    playTypewriterType('AB', (value) => frames.push(value));

    expect(frames).toEqual(['']);
    vi.advanceTimersByTime(typewriterScore.typeDelayMs);
    expect(frames).toEqual(['', 'A']);
    vi.advanceTimersByTime(typewriterScore.typeMs);
    expect(frames).toEqual(['', 'A', 'AB']);
  });

  it('cancel stops further frames', () => {
    const frames: string[] = [];
    const playback = playTypewriterErase('ABCD', (value) => frames.push(value));
    expect(frames).toEqual(['ABC']);
    playback.cancel();
    vi.advanceTimersByTime(typewriterScore.eraseMs * 10);
    expect(frames).toEqual(['ABC']);
  });
});
