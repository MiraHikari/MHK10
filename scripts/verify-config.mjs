/**
 * One source of truth for the verification topology. Build plans, preview
 * servers, Playwright configs and the root runner all read these values so a
 * port or output directory can never drift between them.
 */
export const E2E_PORT = 4423;
export const FUSION_GENERAL_PORT = 4421;
export const FUSION_DESKTOP_PORT = 4422;

export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
export const FUSION_GENERAL_ORIGIN = `http://127.0.0.1:${FUSION_GENERAL_PORT}`;
export const FUSION_DESKTOP_ORIGIN = `http://127.0.0.1:${FUSION_DESKTOP_PORT}`;

/** A closed local port makes Kounter requests fail immediately during tests. */
export const KOUNTER_OFFLINE_URL = 'http://127.0.0.1:9';

/** Root-relative output directories, one per verification configuration. */
export const VERIFY_DIST = Object.freeze({
  e2e: '.verify/e2e/desktop',
  fusionGeneral: '.verify/fusion/general',
  fusionDesktop: '.verify/fusion/desktop',
});
