import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { cruise } from 'dependency-cruiser';
import ts from 'typescript';
import { astroModule } from '../../../../scripts/architecture/astro-imports.mjs';
import { withGlobImports } from './vite-imports.mjs';
import { pureModules, registrationModules, rules } from './rules.mjs';

const root = resolve(import.meta.dirname, '../..');
const domain = new RegExp(pureModules);
const registration = new RegExp(registrationModules);
const capabilityApplication =
  /^src\/lib\/apps\/(?:calculator|notepad|computer|display|media-player)\/.+\.app\.ts$/;
const browserGlobals = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'Storage',
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

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(file) : [file];
      }),
    )
  ).flat();
}

function domainViolations(file, source) {
  if (
    !domain.test(file) &&
    !registration.test(file) &&
    !file.startsWith('src/data/') &&
    !capabilityApplication.test(file)
  )
    return [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const options = { noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === file ? ast : undefined);
  const checker = ts.createProgram([file], options, host).getTypeChecker();
  const violations = [];
  function visit(node) {
    if (ts.isIdentifier(node) && browserGlobals.has(node.text)) {
      // A property name or object key is not a reference to a browser global.
      const parent = node.parent;
      const property =
        (ts.isPropertyAccessExpression(parent) &&
          parent.name === node &&
          parent.expression.getText(ast) !== 'globalThis') ||
        ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) &&
          parent.name === node);
      const locallyDeclared = checker
        .getSymbolAtLocation(node)
        ?.declarations?.some((declaration) => declaration.getSourceFile() === ast);
      if (!property && !locallyDeclared) {
        const { line } = ast.getLineAndCharacterOfPosition(node.getStart());
        violations.push({
          rule: {
            name: capabilityApplication.test(file)
              ? 'application-uses-browser-capabilities'
              : 'domain-has-no-browser-globals',
          },
          from: `${file}:${line + 1}`,
          to: node.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return violations;
}

export async function analyzeArchitecture(sourceRoot = root) {
  const temporaryRoot = resolve(root, '.tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const mirror = await mkdtemp(join(temporaryRoot, 'architecture-'));
  if (!mirror.startsWith(`${temporaryRoot}${sep}`))
    throw new Error('Invalid architecture cache path');
  const violations = [];
  let astroCount = 0;
  const cwd = process.cwd();
  try {
    const sources = await sourceFiles(join(sourceRoot, 'src'));
    const names = sources.map((file) => relative(sourceRoot, file).replaceAll('\\', '/'));
    for (const sourceFile of sources) {
      const file = relative(sourceRoot, sourceFile).replaceAll('\\', '/');
      if (file.endsWith('.test.ts')) continue;
      if (!/\.(?:[cm]?[jt]sx?|astro|css|json|md)$/.test(file)) continue;
      const source = await readFile(sourceFile, 'utf8');
      const target = join(
        mirror,
        file.endsWith('.astro') ? `${file}.ts` : file.endsWith('.md') ? `${file}.raw.ts` : file,
      );
      await mkdir(dirname(target), { recursive: true });
      if (file.endsWith('.md')) {
        // Vite's ?raw import is data, so Markdown never enters the JavaScript parser.
        await writeFile(target, `export default ${JSON.stringify(source)};`);
      } else if (file.endsWith('.astro')) {
        astroCount++;
        await writeFile(target, astroModule(source, file));
      } else {
        violations.push(...domainViolations(file, source));
        await writeFile(
          target,
          /\.[cm]?[jt]sx?$/.test(file) ? withGlobImports(source, file, names) : source,
        );
      }
    }
    process.chdir(mirror);
    const result = await cruise(['src'], {
      baseDir: mirror,
      outputType: 'json',
      tsPreCompilationDeps: 'specify',
      doNotFollow: { path: 'node_modules' },
      exclude: '\\.test\\.ts$',
      extraExtensionsToScan: ['.css', '.json'],
      ruleSet: rules,
      validate: true,
    });
    const graph = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
    violations.push(...graph.summary.violations);
    return { violations, modules: graph.modules, astroCount };
  } finally {
    process.chdir(cwd);
    // Only the new, verified cache directory is removed; never sourceRoot.
    await rm(mirror, { recursive: true, force: true });
  }
}
