/** A session-owned audio file. The host chooses the playback device and asset loader. */
export interface FileAudioSnapshot {
  phase: 'loading' | 'ready' | 'error' | 'disposed';
  playing: boolean;
  position: number;
  duration: number;
  error: string;
}

export interface FileAudio {
  readonly ready: Promise<boolean>;
  snapshot(): FileAudioSnapshot;
  play(): Promise<boolean>;
  pause(): void;
  stop(): void;
  dispose(): void;
}
