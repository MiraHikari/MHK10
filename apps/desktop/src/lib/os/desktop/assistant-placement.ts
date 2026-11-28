// assistant-placement.ts: pure geometry for where the paperclip stands.
// Kept DOM-free (no sprite/canvas imports) so the sprite, its click target and
// the desktop marquee-exclusion box all derive from one computation that can be
// tested in isolation, instead of the magic constants that used to drift apart.

const R = Math.round;

export interface AssistantPlacement {
  /** Bottom-centre anchor passed to assistant(). */
  x: number;
  y: number;
  scale: number;
  /** Shared clickable + marquee-exclusion rectangle under the sprite. */
  hit: { x: number; y: number; w: number; h: number };
}

/**
 * Place the assistant in the bottom-right of the live work area, matching the
 * classic 640x360 corner (feet near 588,326) while following larger desktops.
 */
export function assistantPlacement(width: number, height: number, scale = 2): AssistantPlacement {
  const s = Math.max(1, Math.round(scale));
  // The sprite footprint is 28*s wide and 50*s tall with the feet centred.
  const halfWidth = 14 * s;
  const spriteHeight = 50 * s;
  const rightMargin = 24;
  const bottomMargin = 12;
  const x = R(Math.max(halfWidth, width - rightMargin - halfWidth));
  const y = R(Math.max(spriteHeight, height - bottomMargin));
  return {
    x,
    y,
    scale: s,
    hit: { x: x - halfWidth, y: y - spriteHeight, w: 28 * s, h: spriteHeight },
  };
}
