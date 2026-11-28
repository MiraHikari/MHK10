import { defineConfig, fontProviders } from 'astro/config';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { SITE_ORIGIN } from './src/data/site-origin';

// 首屏关键 chunk 预热：懒加载章节 chunk 预热。About/Projects/Skills/Gallery/
// Friends 都是 App 内 React.lazy 的动态导入（sectionsRegistry）。构建期注入
// 策略（Vite 插件在 client 构建期捕获 chunk 文件名——Astro 的 vite build 配置
// 合并会丢弃 build.manifest，故不走 manifest；Astro 集成随后写入 <head>
// modulepreload）：
//   - 每个挂载 App 的页面都注入根章节 About（首访 LCP 关键路径，遮罩收场
//     依赖其就绪）；
//   - 直链章节页（/projects /skills /gallery /friends）额外注入目标章节
//     chunk，水合后首屏渲染不再撞 Suspense 的 THINKING fallback；
//   - 根页/博客页不注入其余章节——全部章节 modulepreload 会让章节解析抢占主
//     线程、推迟 App 水合，其余章节改由 App 在 contentReady 后
//     requestIdleCallback 空闲预载（见 App.tsx）。
const sectionChunks = { files: [] as string[], modules: {} as Record<string, string> };

const LAZY_SECTION_MODULES = [
  'AboutSection',
  'ProjectsSection',
  'SkillsSection',
  'GallerySection',
  'FriendsSection',
] as const;

// vite 为传递依赖，此处仅用鸭子类型（name + generateBundle），结构性满足插件契约。
const captureSectionChunks = (state: { files: string[]; modules: Record<string, string> }) => ({
  name: 'capture-section-chunks',
  generateBundle(
    _options: unknown,
    bundle: Record<string, { type: string; fileName: string; moduleIds?: string[] }>,
  ) {
    if (state.files.length > 0) return;
    for (const chunk of Object.values(bundle)) {
      // 只认 client 产物（_astro/*.js）；server 构建的同名模块在 chunks/*.mjs。
      if (
        chunk.type !== 'chunk' ||
        !chunk.fileName.startsWith('_astro/') ||
        !chunk.fileName.endsWith('.js')
      )
        continue;
      const match = LAZY_SECTION_MODULES.find((name) =>
        chunk.moduleIds?.some((id) => id.endsWith(`src/components/sections/${name}.tsx`)),
      );
      if (match && !(chunk.fileName in state.modules)) {
        state.modules[chunk.fileName] = match;
        state.files.push(chunk.fileName);
      }
    }
    // 根章节排最前（首访 LCP 关键路径），其余按注册表顺序，保证注入稳定。
    state.files.sort(
      (a, b) =>
        LAZY_SECTION_MODULES.indexOf(state.modules[a] as (typeof LAZY_SECTION_MODULES)[number]) -
        LAZY_SECTION_MODULES.indexOf(state.modules[b] as (typeof LAZY_SECTION_MODULES)[number]),
    );
  },
});

/** 章节 id → chunk 模块名；直链页按首段路径匹配注入目标章节。 */
const LAZY_SECTION_BY_PAGE: Record<string, (typeof LAZY_SECTION_MODULES)[number]> = {
  about: 'AboutSection',
  projects: 'ProjectsSection',
  skills: 'SkillsSection',
  gallery: 'GallerySection',
  friends: 'FriendsSection',
};

const preloadSectionChunks = (state: {
  files: string[];
  modules: Record<string, string>;
}): AstroIntegration => ({
  name: 'preload-section-chunks',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      if (state.files.length === 0) {
        logger.warn('No section chunks captured — skip preload injection');
        return;
      }
      const clientDir = fileURLToPath(dir);
      const linkOf = (fileName: string) => `<link rel="modulepreload" href="/${fileName}" />`;
      const rootLink = linkOf(state.files[0]);
      let injected = 0;
      for (const file of readdirSync(clientDir, { recursive: true })) {
        if (typeof file !== 'string' || !file.endsWith('.html')) continue;
        const lower = file.toLowerCase();
        // 仅挂载 App 的页面需要这些 chunk：404 为 minimal 轻量页，
        // admin 挂载独立后台应用，article-fragments 是无 <head> 的分片。
        if (lower === '404.html' || lower.includes('admin') || lower.includes('article-fragments'))
          continue;
        // 直链章节页额外注入目标章节 chunk；根页/博客页只注入根章节。
        // 目标即根章节（/about）时不重复注入。
        const target = LAZY_SECTION_BY_PAGE[file.split(/[\\/]/)[0]];
        const targetFile = target
          ? state.files.find((f) => state.modules[f] === target)
          : undefined;
        const links =
          targetFile && targetFile !== state.files[0]
            ? `${rootLink}\n    ${linkOf(targetFile)}`
            : rootLink;
        const htmlPath = join(clientDir, file);
        const html = readFileSync(htmlPath, 'utf8');
        if (!html.includes('<head>') || html.includes(rootLink)) continue;
        writeFileSync(htmlPath, html.replace('<head>', `<head>\n    ${links}`));
        injected += 1;
      }
      logger.info(`Preloaded section chunk(s) in ${injected} page(s)`);
    },
  },
});

// https://astro.build/config
export default defineConfig({
  site: SITE_ORIGIN,
  trailingSlash: 'always',
  // Verification builds choose a private configuration directory; the site
  // build keeps Astro's default so deployment always serves `dist`.
  outDir: process.env.MHK_OUT_DIR ?? './dist',

  fonts: [
    {
      name: 'Space Grotesk',
      cssVariable: '--font-space-grotesk',
      provider: fontProviders.google(),
      weights: ['300 700'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext', 'vietnamese'],
      fallbacks: [],
      optimizedFallbacks: false,
    },
    {
      name: 'HarmonyOS Sans SC',
      cssVariable: '--font-harmonyos',
      provider: fontProviders.local(),
      weights: ['400'],
      styles: ['normal'],
      fallbacks: ['Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', 'sans-serif'],
      optimizedFallbacks: false,
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/HarmonyOS_Regular.site.woff2'],
            weight: '400',
            style: 'normal',
            display: 'swap',
          },
        ],
      },
    },
    {
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains',
      provider: fontProviders.fontsource(),
      weights: ['400', '700'],
      styles: ['normal'],
      fallbacks: ['HarmonyOS Sans SC', 'PingFang SC', 'Noto Sans SC', 'sans-serif', 'monospace'],
    },
    {
      name: 'Instrument Serif',
      cssVariable: '--font-instrument-serif',
      provider: fontProviders.fontsource(),
      weights: ['400'],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['serif'],
    },
    {
      // 色带垂直标题专用手写展示体（docs/typography.md「色带垂直标题」）。
      // 仅允许 .rail-vertical-title 使用；其余展示标题一律走 --font-serif。
      name: 'Dancing Script',
      cssVariable: '--font-dancing-script',
      provider: fontProviders.google(),
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: [],
      optimizedFallbacks: false,
    },
  ],
  // 全站导航是 JS 驱动的 fullpage 过渡（history.pushState），Astro 的
  // hover-prefetch 只会预取永远不会被点击加载的整页 HTML，故关闭。
  prefetch: false,

  markdown: {
    shikiConfig: {
      // 与站点深色品牌色协调的高对比语法主题；代码块统一换行避免横向滚动。
      theme: 'github-dark',
      wrap: true,
    },
  },

  vite: {
    plugins: [
      tailwindcss(),
      Icons({ compiler: 'jsx', jsx: 'react' }),
      captureSectionChunks(sectionChunks),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/motion')) return 'motion';
            // react 先于 react-dom 检查：react-dom 的模块路径以
            // node_modules/react 开头，一并归入 react chunk，避免 React
            // 核心被重复内联进 motion / react-dom 两个 chunk。
            if (id.includes('node_modules/react')) return 'react';
            if (id.includes('node_modules/ogl')) return 'ogl';
          },
        },
      },
    },
  },

  integrations: [
    react(),
    mdx(),
    sitemap({
      filter: (page) => {
        const p = new URL(page).pathname;
        return !p.startsWith('/article-fragments/') && !p.startsWith('/admin');
      },
    }),
    preloadSectionChunks(sectionChunks),
  ],
});
