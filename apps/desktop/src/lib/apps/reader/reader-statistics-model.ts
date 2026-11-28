import {
  READING_PACE,
  measureReadingText,
  type ReadingTextMeasurement,
} from '@mhk/site-core/content-model/reading-stats';

export { READING_PACE };
export type ReaderTextStatistics = ReadingTextMeasurement;
export const measureReaderText = measureReadingText;

/** Position-based approximation, not a claim about which text the reader has read. */
export function remainingReadingSeconds(
  statistics: ReaderTextStatistics,
  progress: number,
): number {
  const position = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return statistics.seconds * (1 - position);
}
