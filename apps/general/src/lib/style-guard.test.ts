import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

/**
 * 样式系统静态守卫（见 docs/style-system.md「字面量白名单」与「页面入口」）。
 * 不引入 Stylelint：只对仓库内样式事实做轻量断言——
 *   1. 品牌蓝 #254378 只允许出现在 token 与章节主题数据源；
 *   2. CSS 文件中的基础色字面量必须在白名单内；
 *   3. 样式入口依赖关系（global.css / blog index / admin.css / 页面）成立；
 *   4. 迁移后的废弃路径不再被引用。
 */

const SRC = resolve(__dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const cssFiles = walk(SRC).filter(
  (file) => file.endsWith('.css') && !file.includes('node_modules'),
);
const tsxFiles = walk(SRC).filter(
  (file) =>
    (file.endsWith('.tsx') || file.endsWith('.astro') || file.endsWith('.ts')) &&
    !file.includes('node_modules') &&
    !file.endsWith('.test.ts'),
);
const allSrc = walk(SRC).filter((file) => !file.includes('node_modules'));

const rel = (file: string) => relative(SRC, file).replace(/\\/g, '/');

/* ------------------------------------------------------------------ */
/* 1. 品牌蓝来源                                                        */
/* ------------------------------------------------------------------ */

describe('brand blue (#254378) sources', () => {
  const BRAND_HEX = /#254378/gi;
  const allowedFiles = new Set(['styles/foundations/tokens.css', 'lib/sections.ts']);

  it('only appears in tokens.css and the section theme data source', () => {
    const offenders = allSrc
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => BRAND_HEX.test(readFileSync(file, 'utf8')))
      .map(rel)
      .filter((file) => !allowedFiles.has(file));
    expect(offenders).toEqual([]);
  });

  it('tokens.css keeps the brand blue definition', () => {
    const tokens = readFileSync(join(SRC, 'styles/foundations/tokens.css'), 'utf8');
    const matches = tokens.match(BRAND_HEX) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // 全部出现在 token 定义（--brand / --accent / --ring / --section-accent 回退）中
  });
});

/* ------------------------------------------------------------------ */
/* 2. CSS 基础色字面量白名单                                           */
/* ------------------------------------------------------------------ */

describe('css literal whitelist', () => {
  /** 整文件豁免：token 定义 / 简历浅色打印字阶 / 打印浅色 / Apple 系统蓝。 */
  const fileExempt = new Set([
    'styles/foundations/tokens.css',
    'styles/pages/resume.css',
    'styles/features/blog/print.css',
    'components/ui/GlassSurface.css',
  ]);

  /** 单次语义色例外（docs/style-system.md 白名单）。 */
  const allowedHexes = new Set(['#9db8e8']); // 行内代码语法色

  /** 透明度阶梯：白 / 黑 / 近黑表面（r=g=b≤24）/ 面板阴影 / accent 蓝 alpha 族。 */
  const alphaOk = (color: string): boolean => {
    const rgb = /^rgba?\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*[\d.]+)?\s*\)$/i;
    const spaced = /^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\/\s*[\d.]+%?\)$/i;
    const isAlpha = /^rgba\(/i.test(color) || /\/\s*[\d.]+%?\)$/.test(color);
    if (!isAlpha) return false;
    const m = rgb.exec(color) ?? spaced.exec(color);
    if (!m) return false;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (r === g && g === b && r <= 24) return true; // 近黑 alpha 表面族
    const bases = [
      [255, 255, 255], // white alpha
      [0, 0, 0], // black alpha
      [17, 17, 26], // panel shadow tint
      [111, 147, 196], // accent blue alpha
      [216, 180, 112], // AI 标识琥珀金
    ];
    return bases.some(([br, bg, bb]) => r === br && g === bg && b === bb);
  };

  it('non-exempt css files only carry whitelisted hex literals', () => {
    const offenders: string[] = [];
    for (const file of cssFiles) {
      const path = rel(file);
      if (fileExempt.has(path)) continue;
      const content = readFileSync(file, 'utf8');
      // 剥离注释后再检查，避免注释里的示例色误报
      const code = content.replace(/\/\*[\s\S]*?\*\//g, '');
      const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      for (const hex of hexes) {
        const normalized = hex.toLowerCase();
        if (!allowedHexes.has(normalized)) offenders.push(`${path}: ${hex}`);
      }
      const colors = code.match(/\brgba?\([^)]*\)/gi) ?? [];
      const solidAllowed = new Set(['rgb(216, 180, 112)']); // AI 标识琥珀金（实色）
      for (const raw of colors) {
        const color = raw.replace(/\s+/g, ' ');
        if (solidAllowed.has(color)) continue;
        if (!alphaOk(color)) offenders.push(`${path}: ${raw}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tsx/astro className arbitrary colors stay on the whitelist', () => {
    const allowed = new Set(['#6ce5e8', '#f7f7f8', '#eef2f7']); // 状态 / 浅色表面单例
    const offenders: string[] = [];
    for (const file of tsxFiles) {
      const content = readFileSync(file, 'utf8');
      const hexes = content.match(/\[#[0-9a-fA-F]{3,8}\]/g) ?? [];
      for (const hex of hexes) {
        const value = hex.slice(1, -1).toLowerCase();
        if (!allowed.has(value)) offenders.push(`${rel(file)}: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. 样式入口依赖                                                     */
/* ------------------------------------------------------------------ */

describe('style entry dependencies', () => {
  const read = (path: string) => readFileSync(join(SRC, path), 'utf8');
  /** Quote style is formatter-owned; the dependency graph is the contract. */
  const cssImports = (source: string): string[] =>
    [...source.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  it('global.css aggregates tailwind, lenis and all five foundations', () => {
    const imports = cssImports(read('styles/global.css'));
    for (const entry of [
      'tailwindcss',
      'lenis/dist/lenis.css',
      './foundations/tokens.css',
      './foundations/theme.css',
      './foundations/base.css',
      './foundations/utilities.css',
      './foundations/motion.css',
    ]) {
      expect(imports).toContain(entry);
    }
  });

  it('blog index.css aggregates comments plus the seven blog parts in order', () => {
    const css = read('styles/features/blog/index.css');
    const imports = cssImports(css);
    expect(imports).toEqual([
      '../comments.css',
      './listing.css',
      './article-shell.css',
      './prose.css',
      './media.css',
      './reading-tools.css',
      './responsive.css',
      './print.css',
    ]);
  });

  it('admin.css is isolated from the public site sheets', () => {
    const css = read('styles/admin.css');
    const imports = cssImports(css);
    expect(imports).toEqual(['tailwindcss']);
    expect(css).not.toContain('section-scroll');
    expect(css).not.toContain('custom-cursor');
  });

  it('page entries load their dedicated sheets', () => {
    const notFound = read('pages/404.astro');
    expect(notFound).toContain("import '@/styles/pages/not-found.css'");
    const resume = read('pages/resume.astro');
    expect(resume).toContain("import '@/styles/pages/resume.css'");
    const admin = read('pages/admin.astro');
    expect(admin).toContain("import '@/styles/admin.css'");
  });

  it('every relative @import in css resolves to an existing file', () => {
    const missing: string[] = [];
    for (const file of cssFiles) {
      for (const spec of cssImports(readFileSync(file, 'utf8'))) {
        // Bare specifiers are package imports (Tailwind, Lenis); URLs are external.
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), spec);
        if (!exists(target)) missing.push(`${rel(file)} → ${spec}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

function exists(target: string): boolean {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 4. 已废弃路径                                                       */
/* ------------------------------------------------------------------ */

describe('deprecated import paths', () => {
  const deprecatedPatterns: Array<[string, RegExp]> = [
    ['扁平 blog lib', /from ['"]@\/lib\/blog-[a-z-]+['"]/],
    ['旧 project-types', /from ['"]@\/lib\/project-types['"]/],
    ['旧图片 lib', /from ['"]@\/lib\/image-(?:url|prefetch|download)['"]/],
    ['根级 chrome 组件', /from ['"]@\/components\/(?:Navigation|FullpageChrome)['"]/],
    ['旧灯箱实现', /lightboxYarl/],
    ['旧样式入口', /@\/styles\/(?:blog|animations|comments)\.css/],
    ['旧文章 hooks', /from ['"]@\/hooks\/useArticle(?:Speech|Highlights)['"]/],
    ['旧 blog.css 注释引用', /src\/styles\/blog\.css/],
  ];

  it('no source file references a migrated path', () => {
    const offenders: string[] = [];
    for (const file of allSrc) {
      if (file.endsWith('.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      for (const [label, pattern] of deprecatedPatterns) {
        if (pattern.test(content)) offenders.push(`${rel(file)} (${label})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 5. 字体角色合同（docs/typography.md）                                 */
/* ------------------------------------------------------------------ */

describe('typography contract', () => {
  // Dancing Script 为色带垂直标题专用手写展示体（见 docs/typography.md
  // 「色带垂直标题」），禁止扩散到其他展示元素；
  // Playfair / Bebas / Roboto Flex 均为已删除字面。
  const REMOVED_FACE =
    /playfair|bebas|roboto-flex|font-playfair|font-bebas|font-roboto-flex|--font-playfair|--font-bebas|--font-roboto-flex/i;
  // text-display(?!-) so size tokens like text-display-m are not treated as text-display
  const FORBIDDEN_SERIF_WEIGHT =
    /\b(?:font-serif|text-display(?!-))\b[^"'`\n]{0,120}\b(?:font-bold|font-semibold|font-black)\b|\b(?:font-bold|font-semibold|font-black)\b[^"'`\n]{0,120}\b(?:font-serif|text-display(?!-))\b/;

  it('removes Playfair, Bebas, and Roboto Flex from source', () => {
    const offenders: string[] = [];
    for (const file of allSrc) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = readFileSync(file, 'utf8');
      if (REMOVED_FACE.test(content)) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  it('maps --font-serif to Instrument Serif', () => {
    const theme = readFileSync(join(SRC, 'styles/foundations/theme.css'), 'utf8');
    expect(theme).toMatch(/--font-serif:\s*var\(--font-instrument-serif\)/);
    expect(theme).not.toMatch(/--font-playfair/);
  });

  it('does not pair serif display classes with bold weights', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles) {
      const content = readFileSync(file, 'utf8');
      for (const [i, line] of content.split('\n').entries()) {
        if (FORBIDDEN_SERIF_WEIGHT.test(line)) {
          offenders.push(`${rel(file)}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('confines Dancing Script to the rail vertical title', () => {
    // 允许的消费点：色带垂直标题（.rail-vertical-title）。其余展示元素
    // （水印 / masthead / 荣誉标题 / 灯箱）一律走 --font-serif。
    // 原 Hero 名消费点（HeroContent.css）随第一屏 Home 删除而移除。
    const allowedFiles = new Set(['components/rail/section-rail.css']);
    const offenders: string[] = [];
    for (const file of cssFiles) {
      const content = readFileSync(file, 'utf8');
      if (content.includes('var(--font-dancing-script)') && !allowedFiles.has(rel(file))) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
    // Hero 首屏已删除：hero 样式目录不允许复活。
    expect(exists(join(SRC, 'components/hero'))).toBe(false);

    const railCss = readFileSync(join(SRC, 'components/rail/section-rail.css'), 'utf8');
    expect(railCss).toMatch(/\.rail-vertical-title\s*\{/);
    expect(railCss).toMatch(/font-family:\s*var\(--font-dancing-script\)/);
  });

  it('loads Instrument Serif via Fontsource and Dancing Script via Google in astro.config', () => {
    const config = readFileSync(resolve(SRC, '../astro.config.ts'), 'utf8');
    expect(config).toMatch(/name:\s*["']Instrument Serif["']/);
    expect(config).toMatch(/cssVariable:\s*["']--font-instrument-serif["']/);
    expect(config).toMatch(/fontProviders\.fontsource\(\)/);
    expect(config).toMatch(/name:\s*["']Dancing Script["']/);
    expect(config).toMatch(/cssVariable:\s*["']--font-dancing-script["']/);
    expect(config).not.toMatch(/Bebas Neue|Roboto Flex/);
  });
});
