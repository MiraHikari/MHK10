import { matchesGlob, posix } from 'node:path';
import ts from 'typescript';

/** Resolve Vite's literal glob entry points before dependency-cruiser builds the graph. */
export function withGlobImports(source, file, files) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'glob' &&
      node.expression.expression.getText(ast) === 'import.meta'
    ) {
      const argument = node.arguments[0];
      const elements =
        argument && ts.isArrayLiteralExpression(argument) ? argument.elements : [argument];
      if (
        !elements.length ||
        elements.some((element) => !element || !ts.isStringLiteralLike(element))
      ) {
        throw new Error(
          `${file}: import.meta.glob requires literal patterns for architecture checking.`,
        );
      }
      const patterns = elements.map((element) => element.text);
      const normalize = (pattern) => {
        if (pattern.startsWith('/')) return pattern.slice(1);
        if (!pattern.startsWith('.'))
          throw new Error(
            `${file}: glob aliases need an explicit architecture adapter: ${pattern}`,
          );
        return posix.join(posix.dirname(file), pattern);
      };
      const include = patterns.filter((pattern) => !pattern.startsWith('!')).map(normalize);
      const exclude = patterns
        .filter((pattern) => pattern.startsWith('!'))
        .map((pattern) => normalize(pattern.slice(1)));
      let eager = false;
      let raw = false;
      const options = node.arguments[1];
      if (options && !ts.isObjectLiteralExpression(options)) {
        throw new Error(`${file}: import.meta.glob options must be a literal object.`);
      }
      for (const property of options?.properties ?? []) {
        if (
          ts.isPropertyAssignment(property) &&
          property.name.getText(ast) === 'query' &&
          ts.isStringLiteralLike(property.initializer)
        ) {
          raw = property.initializer.text === '?raw';
        }
        if (ts.isPropertyAssignment(property) && property.name.getText(ast) === 'eager') {
          if (
            ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
              property.initializer.kind,
            )
          ) {
            throw new Error(`${file}: import.meta.glob eager must be a literal boolean.`);
          }
          eager = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
        }
      }
      for (const target of files) {
        if (
          target === file ||
          !include.some((pattern) => matchesGlob(target, pattern)) ||
          exclude.some((pattern) => matchesGlob(target, pattern))
        )
          continue;
        let specifier = posix.relative(posix.dirname(file), target);
        if (!specifier.startsWith('.')) specifier = `./${specifier}`;
        if (specifier.endsWith('.astro')) specifier += '.ts';
        if (raw && specifier.endsWith('.md')) specifier += '.raw.ts';
        imports.push(
          eager ? `import ${JSON.stringify(specifier)};` : `import(${JSON.stringify(specifier)});`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return `${source}\n${imports.join('\n')}`;
}
