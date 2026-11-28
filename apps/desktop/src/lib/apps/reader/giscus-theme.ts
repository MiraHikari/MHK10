/**
 * Sixteen-colour Giscus skins. The CSS is inlined into a data URL so the
 * cross-origin widget can follow the active desktop theme and reading theme
 * without a second stylesheet host.
 */
import { CURSOR_ART } from '../../gfx/cursor-art';
import { themeProperties, type Theme } from '../../gfx/palette';
import type { ReadingTheme } from '@mhk/site-core/fusion/reading-model';

export interface CommentColors {
  /** Page and comment canvas. */
  readonly background: string;
  /** Text on the comment canvas. */
  readonly ink: string;
  readonly muted: string;
  readonly border: string;
  readonly link: string;
  readonly buttonFace: string;
  readonly buttonInk: string;
  readonly bevelHi: string;
  readonly bevelShadow: string;
  readonly accent: string;
  readonly accentText: string;
  readonly dark: boolean;
}

const HEX = /^#([0-9a-f]{6})$/i;

function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((start) => {
      const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function pixelPath(art: string, color: string): string {
  const commands: string[] = [];
  art
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === color) commands.push(`M${x} ${y}h1v1h-1z`);
      }
    });
  return commands.join('');
}

/** Reuse the canvas pointer art as a CSS cursor inside the cross-origin frame. */
function pixelCursor(art: string, hotspotX: number, hotspotY: number, fallback: string): string {
  const rows = art
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean);
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<path fill="#000000" d="${pixelPath(art, 'K')}"/>` +
    `<path fill="#ffffff" d="${pixelPath(art, 'W')}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspotX} ${hotspotY}, ${fallback}`;
}

export const COMMENT_CURSORS = {
  arrow: pixelCursor(CURSOR_ART.arrow, 0, 0, 'default'),
  ibeam: pixelCursor(CURSOR_ART.ibeam, 3, 8, 'text'),
  wait: pixelCursor(CURSOR_ART.wait, 5, 7, 'wait'),
} as const;

/** Perceived brightness keeps dark reader themes on dark form controls. */
export function isDarkCommentCanvas(color: string): boolean {
  const match = HEX.exec(color.trim());
  if (!match) return false;
  const value = Number.parseInt(match[1] ?? '', 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
}

/**
 * Reader themes mirror the `--reader-*` tokens in reader.css; without a
 * reading surface the discussion uses the window's paper and ink.
 */
export function commentThemeColors(theme: Theme, readingTheme?: ReadingTheme): CommentColors {
  const tokens = themeProperties(theme);
  const chrome = {
    buttonFace: tokens.face,
    buttonInk: tokens.ink,
    bevelHi: tokens.hi,
    bevelShadow: tokens.line,
    accent: tokens.accent,
    accentText: tokens['accent-text'],
  } as const;
  const canvas = (background: string, ink: string, muted: string, link: string): CommentColors => {
    const readableInk =
      contrastRatio(background, ink) >= 4.5
        ? ink
        : [tokens.ink, tokens.hi, tokens.shadow].sort(
            (a, b) => contrastRatio(background, b) - contrastRatio(background, a),
          )[0]!;
    return {
      ...chrome,
      background,
      ink: readableInk,
      muted: contrastRatio(background, muted) >= 4.5 ? muted : readableInk,
      border: muted,
      link: contrastRatio(background, link) >= 4.5 ? link : readableInk,
      dark: isDarkCommentCanvas(background),
    };
  };
  if (readingTheme === 'sepia') return canvas(tokens.face, tokens.ink, tokens.muted, tokens.title);
  if (readingTheme === 'night')
    return canvas(tokens.desk, tokens['title-text'], tokens.muted, tokens['title-text']);
  if (readingTheme === 'contrast') return canvas(tokens.shadow, tokens.hi, tokens.hi, tokens.hi);
  return canvas(tokens.paper, tokens.ink, tokens.muted, tokens.title);
}

/** Build the widget stylesheet from palette colours only. */
export function giscusThemeCss(colors: CommentColors): string {
  const font = `"MS Sans Serif", Tahoma, "Segoe UI", sans-serif`;
  return `
html, body {
  background: ${colors.background} !important;
  color: ${colors.ink} !important;
  font-family: ${font} !important;
  font-size: 12px !important;
  line-height: 18px !important;
  color-scheme: ${colors.dark ? 'dark' : 'light'};
}
body { margin: 0 !important; }
*, *::before, *::after { box-sizing: border-box; }
main {
  color-scheme: ${colors.dark ? 'dark' : 'light'};
  --color-canvas-default: ${colors.background};
  --color-canvas-overlay: ${colors.background};
  --color-canvas-inset: ${colors.background};
  --color-canvas-subtle: ${colors.background};
  --color-fg-default: ${colors.ink};
  --color-fg-muted: ${colors.muted};
  --color-fg-subtle: ${colors.muted};
  --color-border-default: ${colors.border};
  --color-border-muted: ${colors.border};
  --color-neutral-muted: ${colors.background};
  --color-accent-fg: ${colors.link};
  --color-accent-emphasis: ${colors.accent};
  --color-btn-text: ${colors.buttonInk};
  --color-btn-bg: ${colors.buttonFace};
  --color-btn-border: ${colors.border};
  --color-btn-hover-bg: ${colors.buttonFace};
  --color-btn-hover-border: ${colors.border};
  --color-btn-active-bg: ${colors.buttonFace};
  --color-btn-primary-text: ${colors.accentText};
  --color-btn-primary-bg: ${colors.accent};
  --color-btn-primary-border: ${colors.accent};
  --color-btn-primary-hover-bg: ${colors.accent};
  --color-btn-primary-hover-border: ${colors.accent};
}
main, main * { border-radius: 0 !important; }
button, input, textarea { font: inherit; }
:is(a, button, input, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid ${colors.link} !important;
  outline-offset: 2px !important;
}
html, body, main { cursor: ${COMMENT_CURSORS.arrow} !important; }
a, button, summary, [role='button'], .btn { cursor: ${COMMENT_CURSORS.arrow} !important; }
input, textarea, [contenteditable='true'] { cursor: ${COMMENT_CURSORS.ibeam} !important; }
[aria-busy='true'], [aria-busy='true'] * { cursor: ${COMMENT_CURSORS.wait} !important; }
.gsc-main, .gsc-comments, .gsc-header, .gsc-reactions, .gsc-comment-box,
.gsc-comment-box-tabs, .gsc-comment-box-main, .gsc-comment-box-bottom,
.gsc-timeline, .gsc-reply-box, .gsc-replies {
  background: ${colors.background} !important;
  color: ${colors.ink} !important;
  box-shadow: none !important;
}
.gsc-comment-box {
  border: 1px solid ${colors.border} !important;
  padding: 4px !important;
}
.gsc-comment-box-tabs > div { margin: 0 !important; }
.gsc-comment-box-tabs button { min-height: 26px; padding: 3px 10px !important; }
.gsc-comment-box-tabs button.color-text-primary {
  font-weight: 700 !important;
  border-bottom: 2px solid ${colors.accent} !important;
}
.gsc-main { gap: 8px !important; }
.gsc-comments { gap: 6px !important; }
.gsc-comment-box-main { padding: 4px 0 !important; margin: 0 !important; }
.gsc-comment-box-bottom { padding: 4px 0 0 !important; gap: 6px; }
.gsc-comment-box-textarea { min-height: 80px !important; padding: 6px !important; }
.gsc-comment-box-textarea:focus-visible { outline-offset: -3px !important; }
.gsc-comment-box-textarea-extras { padding: 3px 6px !important; }
.gsc-reactions {
  flex-direction: row !important;
  justify-content: flex-start !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 !important;
  padding: 0 0 6px !important;
}
.gsc-reactions-count { font-size: 12px !important; }
.gsc-header { padding: 6px 0 !important; }
.gsc-comment-box-textarea, .gsc-comment-box-preview, .gsc-reply-box .form-control {
  background: ${colors.background} !important;
  color: ${colors.ink} !important;
  border: 2px solid !important;
  border-color: ${colors.bevelShadow} ${colors.bevelHi} ${colors.bevelHi} ${colors.bevelShadow} !important;
  font-family: ${font} !important;
}
.gsc-comment-box-textarea::placeholder {
  color: ${colors.muted} !important;
}
.btn, .gsc-comment-box-tabs button, .gsc-reactions-button, .gsc-direct-reaction-button {
  background: ${colors.buttonFace} !important;
  color: ${colors.buttonInk} !important;
  border: 1px solid !important;
  border-color: ${colors.bevelHi} ${colors.bevelShadow} ${colors.bevelShadow} ${colors.bevelHi} !important;
  box-shadow:
    inset 1px 1px ${colors.buttonFace},
    inset -1px -1px ${colors.border} !important;
  font-weight: 400 !important;
}
.btn:hover, .gsc-comment-box-tabs button:hover, .gsc-reactions-button:hover {
  background: ${colors.buttonFace} !important;
  color: ${colors.buttonInk} !important;
  outline: 1px dotted currentColor;
  outline-offset: -4px;
}
.btn, .gsc-reactions-button, .gsc-direct-reaction-button { min-height: 26px; }
.btn:active, .gsc-comment-box-tabs button:active, .gsc-reactions-button:active {
  border-color: ${colors.bevelShadow} ${colors.bevelHi} ${colors.bevelHi} ${colors.bevelShadow} !important;
}
button:disabled, textarea:disabled, [aria-disabled='true'] {
  border-style: dotted !important;
  box-shadow: none !important;
}
.btn-primary, .btn-primary:hover {
  background: ${colors.accent} !important;
  color: ${colors.accentText} !important;
  border-color: ${colors.bevelHi} ${colors.bevelShadow} ${colors.bevelShadow} ${colors.bevelHi} !important;
}
.gsc-loading-image { display: none !important; }
.gsc-comment img, .gsc-reply img {
  border-radius: 0 !important;
  image-rendering: pixelated;
}
.gsc-comment, .gsc-reply {
  border: 1px solid ${colors.border} !important;
  background: ${colors.background} !important;
}
.gsc-comment { padding: 8px !important; }
.gsc-comment-header, .gsc-reply-header {
  border-bottom: 1px solid ${colors.border} !important;
  padding-bottom: 4px !important;
}
.gsc-comment-footer, .gsc-reply-footer {
  color: ${colors.muted} !important;
}
.gsc-reactions { border-bottom: 1px solid ${colors.border} !important; }
.gsc-timeline { border-left: 1px solid ${colors.border} !important; }
.gsc-comment-count, .gsc-reactions-count { color: ${colors.muted} !important; }
a { color: ${colors.link} !important; }
a:hover { color: ${colors.link} !important; text-decoration: underline !important; }
.markdown { font-size: 12px !important; line-height: 18px !important; overflow-wrap: anywhere; }
.markdown pre { overflow-x: auto; }
.markdown img { max-width: 100%; height: auto; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
mark { background: ${colors.accent} !important; color: ${colors.accentText} !important; }
`.trim();
}
