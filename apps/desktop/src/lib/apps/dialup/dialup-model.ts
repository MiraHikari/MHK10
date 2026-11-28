export type DialStage = 'idle' | 'dialing' | 'carrier' | 'negotiating' | 'connected';
export const DIAL_DURATION = 6;
export function dialStage(elapsed: number | null): DialStage {
  if (elapsed === null) return 'idle';
  if (elapsed < 1.8) return 'dialing';
  if (elapsed < 3.7) return 'carrier';
  if (elapsed < DIAL_DURATION) return 'negotiating';
  return 'connected';
}
