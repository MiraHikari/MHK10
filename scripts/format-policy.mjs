export const formatOptions = {
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  semi: true,
  endOfLine: 'lf',
  printWidth: 100,
  sortPackageJson: false,
};

export const ignoredPaths = [
  'node_modules/**',
  'dist/**',
  '.astro/**',
  '.tmp/**',
  '.cache/**',
  'source-repo/**',
  'artifacts/**',
  'test-results/**',
  'playwright-report/**',
  'coverage/**',
];

export function isFormattable(file) {
  return (
    !ignoredPaths.some((pattern) => file.startsWith(pattern.slice(0, -2))) &&
    !file.startsWith('public/vendor/') &&
    !file.startsWith('scripts/architecture/fixtures/') &&
    file !== 'package-lock.json' &&
    /\.(?:[cm]?[jt]sx?|astro|css|jsonc?|md|ya?ml|html)$/.test(file)
  );
}
