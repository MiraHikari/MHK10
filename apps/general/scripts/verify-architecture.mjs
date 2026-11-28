import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { astroImports } from '../../../scripts/architecture/astro-imports.mjs';

/**
 * General-site architecture gate. It covers the rules that are unique to this
 * app; shared-site and desktop gates cover their own trees. Keep this small:
 * a gate that cannot explain a violation is worse than no gate.
 *
 * Astro files use the shared compiler-AST parser. Fusion literals are checked
 * only in executable regions (frontmatter and `<script>` bodies), never in
 * page prose.
 */
const appRoot = resolve(import.meta.dirname, '..');
const browserGlobals = new Set([
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
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
const modelRuntimeImports = [
  /^react(?:-dom)?(?:\/|$)/,
  /^motion(?:\/|$)/,
  /^@\/components(?:\/|$)/,
  /^@\/hooks(?:\/|$)/,
  /^@\/lib\/storage(?:\/|$)/,
];

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = join(directory, entry.name);
        return entry.isDirectory() ? sources(file) : [file];
      }),
    )
  ).flat();
}

function importEntries(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({
        source: node.moduleSpecifier.text,
        typeOnly:
          node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (node.importClause?.namedBindings !== undefined &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            node.importClause.namedBindings.elements.length > 0 &&
            node.importClause.namedBindings.elements.every((element) => element.isTypeOnly)),
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({
        source: node.moduleSpecifier.text,
        typeOnly: node.isTypeOnly === true,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ source: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return { ast, imports };
}

/** Executable Astro code, excluding markup prose that may name the protocol. */
function astroCode(source) {
  const regions = [];
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)?.[1];
  if (frontmatter) regions.push(frontmatter);
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    regions.push(match[1]);
  }
  return regions.join('\n');
}

/**
 * Analyze a general-site tree. `rootDir` must contain `src/`; tests pass a
 * temporary fixture root so the same rules can prove both clean and hostile
 * inputs without touching the application.
 */
export async function analyzeArchitecture(rootDir = appRoot) {
  const sourceRoot = join(rootDir, 'src');
  const violations = [];
  const files = (await sources(sourceRoot)).filter(
    (file) => /\.(?:[cm]?[jt]sx?|astro)$/.test(file) && !file.endsWith('.test.ts'),
  );
  let astroCount = 0;
  for (const file of files) {
    const name = relative(rootDir, file).replaceAll('\\', '/');
    const source = await readFile(file, 'utf8');
    const astro = file.endsWith('.astro');
    if (astro) astroCount += 1;
    const fusionLiteral = /["'`]mhk-fusion(?::[^"'`]+)?["'`]/;
    // Declarations carry protocol types, not runtime namespace literals.
    const fusionSource = astro ? astroCode(source) : file.endsWith('.d.ts') ? null : source;
    if (fusionSource !== null && fusionLiteral.test(fusionSource)) {
      violations.push(`${name}: use shared fusion namespace and event constants`);
    }
    let ast;
    let imports;
    if (astro) {
      try {
        imports = astroImports(source, name);
      } catch (error) {
        // A parse failure is a gate violation, not a crashed checker.
        violations.push(error instanceof Error ? error.message : `${name}: ${String(error)}`);
        continue;
      }
    } else {
      ({ ast, imports } = importEntries(file, source));
    }
    const model = !astro && file.endsWith('-model.ts');
    for (const entry of imports) {
      if (entry.source.startsWith('@mhk/desktop') || /(?:^|\/)desktop\//.test(entry.source)) {
        violations.push(`${name}: app must not depend on the desktop presentation`);
        continue;
      }
      if (model && !entry.typeOnly && modelRuntimeImports.some((rule) => rule.test(entry.source))) {
        violations.push(`${name}: pure model imports runtime adapter ${entry.source}`);
      }
      if (!entry.source.startsWith('.')) continue;
      const target = resolve(dirname(file), entry.source);
      if (!target.startsWith(`${sourceRoot}${sep}`)) {
        violations.push(`${name}: relative import escapes src: ${entry.source}`);
      }
    }
    if (!model || !ast) continue;
    const sourceFile = ast;
    const checker = ts.createProgram([file], { noLib: true, noResolve: true }).getTypeChecker();
    const reportBrowserGlobal = (node) => {
      const parent = node.parent;
      const property =
        (ts.isPropertyAccessExpression(parent) &&
          parent.name === node &&
          parent.expression.getText(sourceFile) !== 'globalThis') ||
        ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) &&
          parent.name === node);
      const local = checker
        .getSymbolAtLocation(node)
        ?.declarations?.some((declaration) => declaration.getSourceFile() === sourceFile);
      if (!property && !local) {
        violations.push(`${name}: pure model reads browser global ${node.text}`);
      }
    };
    const visit = (node) => {
      if (ts.isIdentifier(node) && browserGlobals.has(node.text)) reportBrowserGlobal(node);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { violations, files: files.length, astroCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { violations, files, astroCount } = await analyzeArchitecture();
  if (violations.length) {
    for (const violation of violations) console.error(violation);
    console.error(`Architecture check failed with ${violations.length} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log(
      `Verified ${files} general modules (${astroCount} Astro files): model purity and presentation independence.`,
    );
  }
}
