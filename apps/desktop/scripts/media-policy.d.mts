export const IMAGE_SUFFIXES: ReadonlySet<string>;
export const PREVIEW_SECTIONS: readonly string[];
export const PREVIEW_CAPS: Readonly<{
  profile: Readonly<{ width: number; height: number }>;
  default: Readonly<{ width: number; height: number }>;
}>;

export function previewCap(section: string): Readonly<{ width: number; height: number }>;
export const DISPLAY_SUFFIX: string;
export function isDisplayCopy(path: string): boolean;
export function displayCopyPath(path: string): string;
export function isBundledOriginal(path: string): boolean;
export function compareStrings(left: string, right: string): number;
export function mediaInfoProblems(label: string, key: string, info: unknown): string[];
export function mediaBytesProblem(
  label: string,
  key: string,
  info: unknown,
  actualBytes: number,
): string | undefined;
export function collectAuthoredOriginals(
  profile: {
    galleryItems?: readonly { downloadSrc?: string }[];
    honors?: readonly { downloadSrc?: string }[];
  },
  photos: readonly { full?: string }[],
): string[];
export function splitAuthoredOriginals(originals: readonly string[]): {
  bundledOriginals: string[];
  r2Only: string[];
};
export function localKey(canonical: string): string;
export function publishedPath(root: string, file: string): string;
