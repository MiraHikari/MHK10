import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import {
  useVisibleDisplayMode,
  getDisplayMode,
  getVisibleDisplayMode,
} from '@/hooks/useDisplayMode';
import { pauseSpeech } from '@/hooks/blog/useArticleSpeech';

type SfxName = 'nav' | 'hover' | 'transition';

interface SfxSpec {
  readonly freq: number;
  readonly freqEnd: number;
  readonly duration: number;
  readonly volume: number;
  readonly type: OscillatorType;
}

const BGM_SRC = '/bgm.mp3';
const BGM_VOLUME = 0.3;

const SFX_SPECS: Record<SfxName, SfxSpec> = {
  nav: { freq: 180, freqEnd: 140, duration: 0.08, volume: 0.14, type: 'square' },
  hover: { freq: 520, freqEnd: 480, duration: 0.03, volume: 0.06, type: 'triangle' },
  transition: { freq: 220, freqEnd: 560, duration: 0.15, volume: 0.1, type: 'sawtooth' },
};

type WebkitAudioWindow = Window & {
  readonly webkitAudioContext?: typeof AudioContext;
};

/**
 * Owns the complete audio graph for the App React island.
 *
 * The AudioContext and the large BGM asset stay lazy until an explicit user
 * action. UI sounds reuse the same context and are enabled only while the BGM
 * is playing, preserving the existing sound preference without duplicate
 * contexts in App and Navigation.
 */
export function useAudioSystem() {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playingRef = useRef(false);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const { reducedMotion } = useMediaCapabilities();
  const displayMode = useVisibleDisplayMode();
  const audioWanted = useRef(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (displayMode === 'win95') {
      pauseSpeech();
      audioWanted.current = audioWanted.current || playingRef.current;
      operationRef.current += 1;
      audio?.pause();
      playingRef.current = false;
      setPlaying(false);
    } else if (audioWanted.current && audio) {
      audioWanted.current = false;
      const operation = ++operationRef.current;
      void audio
        .play()
        .then(() => {
          if (
            !mountedRef.current ||
            operation !== operationRef.current ||
            getVisibleDisplayMode() !== 'classic'
          ) {
            audio.pause();
            return;
          }
          playingRef.current = true;
          setPlaying(true);
        })
        .catch(() => undefined);
    }
  }, [displayMode]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const updatePlaying = useCallback((nextPlaying: boolean) => {
    playingRef.current = nextPlaying;
    if (mountedRef.current) setPlaying(nextPlaying);
  }, []);

  const ensureContext = useCallback(() => {
    const current = contextRef.current;
    if (current && current.state !== 'closed') return current;
    if (typeof window === 'undefined') return null;

    const AudioContextCtor =
      window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor();
    contextRef.current = context;
    return context;
  }, []);

  const ensureBGM = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    if (typeof Audio === 'undefined') return null;

    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = BGM_VOLUME;
    audio.src = BGM_SRC;
    audioRef.current = audio;
    return audio;
  }, []);

  const ensureBGMGraph = useCallback((context: AudioContext, audio: HTMLAudioElement) => {
    if (sourceRef.current) return;

    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.82;

    source.connect(analyser);
    analyser.connect(context.destination);
    sourceRef.current = source;
    analyserRef.current = analyser;
  }, []);

  const toggle = useCallback(() => {
    if (getDisplayMode() !== 'classic') return;
    const audio = ensureBGM();
    const context = ensureContext();
    if (!audio || !context) return;

    ensureBGMGraph(context, audio);
    const operation = ++operationRef.current;

    if (!audio.paused) {
      audio.pause();
      updatePlaying(false);
      return;
    }

    void (async () => {
      if (context.state === 'suspended') await context.resume();
      if (
        !mountedRef.current ||
        operation !== operationRef.current ||
        getDisplayMode() !== 'classic'
      )
        return;
      await audio.play();
      if (
        !mountedRef.current ||
        operation !== operationRef.current ||
        getDisplayMode() !== 'classic'
      ) {
        audio.pause();
        return;
      }
      updatePlaying(true);
    })().catch(() => {
      if (operation === operationRef.current) updatePlaying(false);
    });
  }, [ensureBGM, ensureBGMGraph, ensureContext, updatePlaying]);

  const playSfx = useCallback(
    (name: SfxName) => {
      if (!playingRef.current || reducedMotionRef.current) return;

      const context = ensureContext();
      if (!context) return;
      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined);
      }

      const spec = SFX_SPECS[name];
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = spec.type;
      oscillator.frequency.setValueAtTime(spec.freq, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(spec.freqEnd, 20),
        now + spec.duration,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(spec.volume, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + spec.duration + 0.02);
    },
    [ensureContext],
  );

  const playNav = useCallback(() => playSfx('nav'), [playSfx]);
  const playHover = useCallback(() => playSfx('hover'), [playSfx]);
  const playTransition = useCallback(() => playSfx('transition'), [playSfx]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      playingRef.current = false;
      audioRef.current?.pause();
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      const context = contextRef.current;
      if (context && context.state !== 'closed') {
        void context.close().catch(() => undefined);
      }
      audioRef.current = null;
      sourceRef.current = null;
      analyserRef.current = null;
      contextRef.current = null;
    };
  }, []);

  return {
    playing,
    toggle,
    analyserRef,
    playNav,
    playHover,
    playTransition,
  };
}
