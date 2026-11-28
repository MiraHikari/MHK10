/**
 * Logical storage identities shared by both presentations.
 *
 * Physical keys stay per-origin: the general site's catalog keeps its
 * `mirahikari-portfolio:` keys, while the desktop keeps its bare legacy keys.
 * These constants name the service behind a key so an adapter on either side
 * cannot silently drift to a different identity.
 */
export const SHARED_SERVICE_KEYS = Object.freeze({
  /** OpenKounter's 24-hour visit-dedupe flags. */
  kounterFlags: 'kounter-flags',
  /** Giscus sign-in session token obtained from a GitHub redirect. */
  giscusSession: 'giscus-session',
});

export { READER_STORAGE_KEY, SHARED_READING_STORAGE_KEY } from '../fusion/reading-keys';
