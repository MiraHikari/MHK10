import { parse } from '@astrojs/compiler-rs';

/** Read compiler ASTs instead of matching code, comments, or markup with regexes. */
export function astroImports(source, file) {
  const { ast, diagnostics } = parse(source);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length) throw new Error(`${file}: ${errors.map((error) => error.text).join('; ')}`);
  const imports = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
      ].includes(node.type) &&
      (typeof node.source?.value === 'string' ||
        (node.source?.type === 'TemplateLiteral' && node.source.expressions.length === 0))
    ) {
      imports.push({
        source: node.source.value ?? node.source.quasis[0].value.cooked,
        dynamic: node.type === 'ImportExpression',
        typeOnly:
          node.importKind === 'type' ||
          node.exportKind === 'type' ||
          (node.specifiers?.length > 0 &&
            node.specifiers.every((specifier) => specifier.importKind === 'type')),
      });
    }
    if (node.type === 'JSXOpeningElement' && node.name?.name === 'script') {
      const src = node.attributes.find((attribute) => attribute.name?.name === 'src');
      if (typeof src?.value?.value === 'string') {
        imports.push({ source: src.value.value, dynamic: false, typeOnly: false });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return imports;
}

/** A dependency-only module lets dependency-cruiser resolve all Astro edges normally. */
export function astroModule(source, file) {
  return astroImports(source, file)
    .map((entry, index) => {
      let target = entry.source;
      if (target.startsWith('http:') || target.startsWith('https:')) return '';
      if (target.endsWith('.astro')) target += '.ts';
      const specifier = JSON.stringify(target);
      if (entry.typeOnly) return `import type * as dependency${index} from ${specifier};`;
      return entry.dynamic ? `import(${specifier});` : `import ${specifier};`;
    })
    .join('\n');
}
