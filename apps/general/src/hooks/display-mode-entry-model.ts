import { DISPLAY_MODE_BOOTSTRAP, type DisplayMode } from './display-mode-model';

export interface DisplayModeEntryContext {
  /** `PUBLIC_DESK_URL` is configured; the desktop has a destination to enter. */
  readonly enabled: boolean;
  readonly target: DisplayMode;
  /** The visitor already accepted this warning in the current session. */
  readonly acknowledged: boolean;
  readonly viewportWidth: number;
  readonly coarsePointer: boolean;
}

/**
 * The Win95 desktop is a pointer-and-keyboard presentation. Phones can still
 * enter it deliberately, but the first entry deserves a warning: the general
 * site is the complete touch-first reading experience, while the desktop
 * shrinks windows, task controls and text into a 640×360 world.
 *
 * This is a pure decision so the inline toggle, command palette and tests all
 * share the same rule. Only explicit entries ask; the general site is what
 * every visitor sees first, so a coarse pointer or narrow window is the only
 * case that needs the warning.
 */
export function needsDesktopEntryNotice(context: DisplayModeEntryContext): boolean {
  return (
    context.enabled &&
    context.target === 'win95' &&
    !context.acknowledged &&
    (context.coarsePointer || context.viewportWidth < DISPLAY_MODE_BOOTSTRAP.minWidth)
  );
}
