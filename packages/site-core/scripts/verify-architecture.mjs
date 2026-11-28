import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
// Only the publication schema validates with zod; other core modules stay dependency-free.
const contentModelExternalDependencies = new Set(['zod']);
const browserGlobals = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'Storage',
  'StorageEvent',
  'HTMLElement',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'ResizeObserver',
  'MutationObserver',
  'matchMedia',
  'getComputedStyle',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
]);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = join(directory, entry.name);
        return entry.isDirectory() ? files(file) : [file];
      }),
    )
  ).flat();
}

const violations = [];
const sources = (await files(join(root, 'src'))).filter(
  (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
);
for (const file of sources) {
  const name = relative(root, file).replaceAll('\\', '/');
  const options = { noLib: true, noResolve: true };
  const program = ts.createProgram([file], options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Cannot inspect shared source ${file}`);
  const pure =
    file.endsWith('-model.ts') ||
    file.endsWith('fusion-session.ts') ||
    file.endsWith('reading-storage.ts') ||
    file.endsWith('reading-command.ts') ||
    file.endsWith('reading-limits.ts') ||
    file.endsWith('reading-repository.ts') ||
    file.endsWith('reading-keys.ts') ||
    /\/(?:media|config|content-model)\//.test(name);
  const report = (node, rule) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    violations.push(`${name}:${line + 1}: ${rule}`);
  };
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const target = specifier.text;
      if (!target.startsWith('.')) {
        const contentModel = /\/content-model\//.test(name);
        if (!contentModel || !contentModelExternalDependencies.has(target))
          report(node, 'core depends only on core source');
      } else {
        const location = resolve(dirname(file), target);
        const sharedContent = `${join(root, 'content')}${sep}`;
        if (!location.startsWith(join(root, 'src')) && !location.startsWith(sharedContent))
          report(node, 'core must not depend on apps');
        if (
          pure &&
          !/(?:-model|reading-storage|reading-command|reading-limits|reading-repository|reading-keys)$/.test(
            target,
          ) &&
          !/\/(?:media|config|content-model)\//.test(name)
        )
          report(node, 'domain must not import browser adapters');
        // The repository is the implementation; the storage adapter sits above it.
        if (name.endsWith('reading-repository.ts') && /^\.\/reading-storage(?:\.ts)?$/.test(target))
          report(node, 'repository must not depend on its compatibility adapter');
      }
    }
    if (pure && ts.isIdentifier(node) && browserGlobals.has(node.text)) {
      const parent = node.parent;
      const property =
        (ts.isPropertyAccessExpression(parent) &&
          parent.name === node &&
          parent.expression.getText(source) !== 'globalThis') ||
        ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) &&
          parent.name === node);
      if (!property) {
        const local = checker
          .getSymbolAtLocation(node)
          ?.declarations?.some((declaration) => declaration.getSourceFile() === source);
        if (!local) report(node, `domain must not read browser global ${node.text}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (violations.length) {
  for (const violation of violations) console.error(violation);
  process.exitCode = 1;
} else console.log(`Verified ${sources.length} shared modules: pure domains and app independence.`);
