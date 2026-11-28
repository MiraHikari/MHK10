export type SectionPoseKind = 'visible' | 'exit' | 'enter' | 'parked';

/** Mirrors `FullpageTransitionPhase` without importing from hooks into lib. */
export type SectionTransitionPhase = 'idle' | 'exit' | 'bridge' | 'enter';

/**
 * Which container pose a mounted section should take during fullpage
 * choreography. Neighbours must resolve to `parked` (no filter) so cross
 * night/paper transitions do not keep two extra full-viewport blur layers alive.
 */
export function resolveSectionPoseKind(opts: {
  readonly isActive: boolean;
  readonly sectionVisible: boolean;
  readonly phase: SectionTransitionPhase;
}): SectionPoseKind {
  if (!opts.isActive) return 'parked';
  if (opts.sectionVisible) return 'visible';
  if (opts.phase === 'exit') return 'exit';
  return 'enter';
}
