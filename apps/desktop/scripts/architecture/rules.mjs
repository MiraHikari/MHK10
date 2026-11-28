// New *-model.ts modules are pure by convention, including modules in subdirectories.
// These established domain names keep the same protection without renaming public imports.
const domainFiles = [
  'gfx/palette',
  'gfx/timing',
  'gfx/display-metrics',
  'ui/canvas/layout',
  'ui/canvas/menu-navigation',
  'ui/canvas/list-navigation',
  'os/story/doom',
  'os/story/story',
  'os/files/filesystem',
  'os/files/filesystem-records',
  'os/files/documents',
  'os/files/save-request',
  'os/story/diagnostics',
  'os/story/runtime-state',
  'os/desktop/desktop-settings',
  'os/audio/speaker-sequence',
  'os/audio/file-audio',
  'os/desktop/desktop-icon-layout',
  'os/desktop/desktop-selection',
  'os/windows/window-motion',
  'os/windows/resize',
  'ui/text/print-layout',
  'os/ai/ai-connection',
  'os/files/file-types',
  'os/files/file-search',
  'os/host/viewport',
  'os/files/file-transfer',
  'os/files/file-associations',
  'ui/text/markdown',
  'ui/browser/keyboard-shortcuts',
  'os/desktop/frame-keys',
  'os/desktop/assistant-placement',
  'os/files/file-drop-geometry',
  'apps/mines/board',
  'apps/notepad/diary',
  'ui/text/document',
];
export const pureModules = `^src/lib/(?:${domainFiles.join('|')}|.+-model)\\.ts$`;
export const registrationModules = '^src/lib/apps/.+\\.registration\\.ts$';

export const rules = {
  forbidden: [
    {
      name: 'registration-has-no-dependencies',
      severity: 'error',
      from: { path: registrationModules },
      to: {},
    },
    {
      name: 'metadata-stays-build-safe',
      severity: 'error',
      from: { path: '^src/data/' },
      to: { path: '^src/lib/' },
    },
    {
      name: 'no-runtime-cycles',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        preCompilationOnly: false,
        viaOnly: { dependencyTypesNot: ['type-only'] },
      },
    },
    {
      name: 'graphics-do-not-own-applications',
      severity: 'error',
      from: { path: '^src/lib/gfx/' },
      to: { path: '^src/lib/(?:apps|os)/' },
    },
    {
      name: 'applications-use-contracts',
      severity: 'error',
      from: { path: '^src/lib/apps/' },
      to: {
        path: '^src/lib/os/desktop/(?:shell|desktop-launch|desktop-file-drag|message-window|desktop-context-menu)\\.ts$',
      },
    },
    {
      name: 'applications-use-file-capabilities',
      severity: 'error',
      from: { path: '^src/lib/apps/' },
      to: {
        path: '^src/lib/os/files/(?:save-dialog|browser-files|document-backup|native-file-bridge)\\.ts$',
      },
    },
    {
      name: 'applications-use-browser-capabilities',
      severity: 'error',
      from: { path: '^src/lib/apps/', pathNot: '^src/lib/apps/testing/' },
      to: {
        path: '^src/lib/os/(?:host/(?:text-clipboard|browser-file-picker)|audio/browser-file-audio)\\.ts$',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'domain-has-no-host-dependencies',
      severity: 'error',
      from: { path: pureModules },
      to: { path: '^src/', pathNot: [pureModules, '^src/data/'] },
    },
    {
      name: 'local-imports-resolve',
      severity: 'error',
      from: {},
      to: {
        couldNotResolve: true,
        path: '^(?:\\.{1,2}/|src/)',
        pathNot: '\\.(?:css|woff2|png|svg)(?:\\?|$)',
      },
    },
  ],
};
