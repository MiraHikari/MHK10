/**
 * Command registry — centralized command definitions, handlers, and utilities
 * for the CommandPalette. Extracted from the monolithic CommandPalette.tsx
 * so that commands are defined once and the component only handles UI/state.
 *
 * Architecture:
 *   createStaticCommands()  →  nav + link + action commands (immutable per session)
 *   createDynamicCommands() →  project / tag / skill / honor commands (data-driven)
 *   COMMAND_HANDLERS        →  Record<string, CommandHandler> (eliminates the giant switch)
 *   Helper fns              →  fuzzyMatch, truncate, computeCalcInfo, parseQueryPrefix, etc.
 *
 * For commands whose ids are dynamic (article-*, tag-*, project-*, skill-*,
 * honor-*, copy-result), the component is expected to resolve the handler via
 * a short prefix‑based fallback **after** checking COMMAND_HANDLERS.
 */

import { SECTIONS, ROOT_SECTION_ID, getSectionPath } from '@/lib/sections';
import { profile, skills, honors } from '@/data/profile';
import { DESK_EMBED_ENABLED } from '@/hooks/useDisplayMode';
import { requestDisplayMode } from '@/hooks/useDisplayModeEntry';
import { setMotionOverride } from '@/hooks/useMotionPreference';
import { setPerfOverride } from '@/hooks/useDevicePerformance';
import { getZenMode, setZenMode } from '@/lib/blog/reading-prefs';
import { resolveImageSrc } from '@/lib/images/url';
import type { MotionLevel } from '@/lib/motion';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type CommandType = 'nav' | 'link' | 'action';
export type CommandGroup =
  | 'pages'
  | 'links'
  | 'actions'
  | 'articles'
  | 'projects'
  | 'tags'
  | 'skills'
  | 'honors';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly type: CommandType;
  readonly hint: string;
  readonly keywords?: readonly string[];
  readonly group: CommandGroup;
  readonly path?: string;
  readonly url?: string;
  readonly targetSection?: string;
  readonly targetId?: string;
}

export interface SearchLimiter {
  readonly prefix: Exclude<QueryPrefix, null>;
  readonly label: string;
  readonly hint: string;
}

/* ------------------------------------------------------------------ */
/*  CommandContext — what every handler receives                       */
/* ------------------------------------------------------------------ */

export interface CommandContext {
  /** Navigate to a fullpage section by id. */
  navigate(sectionId: string): void;

  /** SPA‑transition into a blog article by its slug. */
  navigateToArticle(slug: string): void;

  /** Navigate to a section AND scroll-to / highlight a specific item. */
  navigateToItem(sectionId: string, itemId: string): void;

  /** Open an external URL in a new tab (`window.open`). */
  openUrl(url: string): void;

  /** Toggle background music play/pause. */
  toggleBGM(): void;

  /** Open a contact QR code (0 = WeChat, 1 = Feishu/Lark, 2 = 赞赏). */
  openContactQR(index: number): void;

  /** Write text to the system clipboard. */
  copyToClipboard(text: string): void;

  /** Immediately close the command palette. */
  closePalette(): void;

  /** Turn 「灵光模式」on or off. */
  toggleLucidMode(): void;

  /** Id of the section currently on screen — lets commands avoid it. */
  readonly currentSectionId: string;
}

export type CommandHandler = (context: CommandContext) => void | Promise<void>;

/* ------------------------------------------------------------------ */
/*  Query‑prefix parsing                                               */
/* ------------------------------------------------------------------ */

const VALID_PREFIXES = ['blog', 'article', 'project', 'cmd', 'tag', 'skill', 'honor'] as const;

type QueryPrefix = (typeof VALID_PREFIXES)[number] | null;

export const SEARCH_LIMITERS: readonly SearchLimiter[] = [
  { prefix: 'cmd', label: '命令', hint: '操作与导航' },
  { prefix: 'blog', label: '文章', hint: '博客全文' },
  { prefix: 'project', label: '项目', hint: '作品条目' },
  { prefix: 'tag', label: '标签', hint: '文章标签' },
  { prefix: 'skill', label: '技能', hint: '技能清单' },
  { prefix: 'honor', label: '荣誉', hint: '奖项证书' },
] as const;

export interface ParsedQuery {
  prefix: QueryPrefix;
  term: string;
}

/** Parse a leading `:prefix` from the raw query string. */
export function parseQueryPrefix(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { prefix: null, term: '' };
  // Match `:word rest` or `:` alone
  const match = trimmed.match(/^:(\w*)\s*(.*)/);
  if (!match) return { prefix: null, term: trimmed };
  const rawPrefix = match[1].toLowerCase();
  const term = match[2];
  // :article is an alias for :blog
  if (rawPrefix === 'article') return { prefix: 'blog', term };
  // : alone → :cmd
  if (rawPrefix === '') return { prefix: 'cmd', term };
  // Unknown prefix → treat as normal search
  if (!(VALID_PREFIXES as readonly string[]).includes(rawPrefix)) {
    return { prefix: null, term: trimmed };
  }
  return { prefix: rawPrefix as QueryPrefix, term };
}

/* ------------------------------------------------------------------ */
/*  Truncate                                                           */
/* ------------------------------------------------------------------ */

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/* ------------------------------------------------------------------ */
/*  Calculator                                                         */
/* ------------------------------------------------------------------ */

// 计算器第一道门：只放行数字与基础运算符。new Function 仅在白名单通过后
// 才执行，禁止绕过此校验（命令面板输入不可信）。
const CALC_ALLOWED = /^[\d+\-*/().%\s]+$/;

function evaluateExpr(expr: string): { ok: true; value: number } | { ok: false; error: string } {
  try {
    const fn = new Function(`'use strict'; return (${expr})`);
    const value = fn();
    if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
      return { ok: true, value };
    }
    return { ok: false, error: '表达式无效' };
  } catch {
    return { ok: false, error: '表达式无效' };
  }
}

export function computeCalcInfo(
  query: string,
): { ok: true; value: number } | { ok: false; error: string } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  let expr: string | null = null;

  if (trimmed.startsWith('=')) {
    expr = trimmed.slice(1).trim();
  } else {
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('calc ')) {
      expr = trimmed.slice(5).trim();
    } else if (lower.startsWith('计算 ')) {
      expr = trimmed.slice(3).trim();
    }
  }

  if (expr === null || !expr) return null;
  if (!CALC_ALLOWED.test(expr)) {
    return { ok: false, error: '表达式包含非法字符' };
  }
  return evaluateExpr(expr);
}

/* ------------------------------------------------------------------ */
/*  Group label, type badge, type color                                */
/* ------------------------------------------------------------------ */

export function groupLabel(g: CommandGroup): string {
  switch (g) {
    case 'pages':
      return '导航';
    case 'links':
      return '链接';
    case 'actions':
      return '操作';
    case 'articles':
      return '文章';
    case 'projects':
      return '项目';
    case 'tags':
      return '标签';
    case 'skills':
      return '技能';
    case 'honors':
      return '荣誉';
    default:
      return '';
  }
}

export function typeBadge(type: CommandType): string {
  if (type === 'nav') return 'NAV';
  if (type === 'action') return 'ACT';
  return 'LINK';
}

export function typeColor(type: CommandType): string {
  if (type === 'nav') return 'text-accent-ink';
  if (type === 'action') return 'text-accent-ink';
  return 'text-white/40';
}

/* ------------------------------------------------------------------ */
/*  createStaticCommands                                               */
/* ------------------------------------------------------------------ */

const lastSection = SECTIONS[SECTIONS.length - 1];

/** Manual motion-tier commands, keyed by the level they pin. */
const MOTION_LEVEL_COMMANDS: readonly { level: MotionLevel; label: string; hint: string }[] = [
  { level: 'full', label: '动效：完整 / Motion: Full', hint: '开启全部背景与转场效果' },
  { level: 'mobile', label: '动效：精简 / Motion: Lite', hint: '降低背景负载，保留转场' },
  { level: 'reduced', label: '动效：静态 / Motion: Static', hint: '关闭装饰动效，只保留内容' },
];

/**
 * Build the static (non‑data‑driven) command list.
 *
 * Includes:
 *  - nav commands (one per section)
 *  - link commands (GitHub, Bilibili, Email, WeChat, Feishu, 赞赏)
 *  - action commands (resume‑pdf, goto‑home, goto‑last, toggle‑bgm,
 *    random‑section, lucid‑mode, motion tiers)
 */
export function createStaticCommands(
  bgmPlaying: boolean,
  lucidMode = false,
  zenMode = false,
): Command[] {
  const navCommands: Command[] = SECTIONS.map((section) => {
    const path = getSectionPath(section.id);
    return {
      id: section.id,
      label: `${section.en} / ${section.zh}`,
      type: 'nav' as const,
      group: 'pages' as const,
      path,
      hint: `${path} · 跳转页面`,
      keywords: [section.id, section.en, section.zh, path],
    };
  });

  return [
    ...navCommands,
    {
      id: 'github',
      label: 'GitHub / 代码仓库',
      type: 'link',
      group: 'links',
      hint: '在新标签页打开 GitHub',
      keywords: ['repo', 'code', 'github', '仓库'],
      url: profile.github,
    },
    {
      id: 'bilibili',
      label: 'Bilibili / 哔哩哔哩',
      type: 'link',
      group: 'links',
      hint: '在新标签页打开 Bilibili 空间',
      keywords: ['video', 'b站', 'bilibili'],
      url: profile.bilibili,
    },
    {
      id: 'email',
      label: 'Email / 邮箱',
      type: 'link',
      group: 'links',
      hint: '打开邮件客户端写信',
      keywords: ['mail', 'contact', '联系', '邮件'],
      url: `mailto:${profile.email}`,
    },
    {
      id: 'copy-email',
      label: '复制邮箱地址 / Copy Email',
      type: 'action',
      group: 'links',
      hint: `复制 ${profile.email} 到剪贴板`,
      keywords: ['copy', 'mail', 'email', '复制', '邮箱', '联系'],
    },
    {
      id: 'resume-pdf',
      label: '导出 PDF 简历 / Export Resume',
      type: 'action',
      group: 'actions',
      hint: '打开打印预览，选择「另存为 PDF」即可保存',
      keywords: ['pdf', 'print', '简历', 'resume', '下载', 'export', '打印'],
      url: '/resume?print=1',
    },
    {
      // Home 首屏已删除；此命令回到根章节（`/` 落地页的首屏内容）。
      id: 'goto-home',
      label: '回到顶部 / Back to Start',
      type: 'action',
      group: 'actions',
      hint: '跳转到第一个页面',
      keywords: ['home', 'top', 'first', '首页', '开始', '顶部'],
    },
    {
      id: 'goto-last',
      label: `跳到末页 / Go to Last → ${lastSection.en}`,
      type: 'action',
      group: 'actions',
      hint: `跳转到最后一个页面 (${lastSection.en})`,
      keywords: ['last', 'end', 'bottom', '末尾', '末页', '最后', lastSection.en.toLowerCase()],
    },
    {
      id: 'wechat',
      label: '微信好友 / WeChat',
      type: 'link',
      group: 'links',
      hint: '扫码添加微信好友',
      keywords: ['wechat', '微信', '好友', 'qr', '联系方式'],
      url: resolveImageSrc('/images/contact/wechat.webp'),
    },
    {
      id: 'feishu',
      label: '飞书好友 / Lark',
      type: 'link',
      group: 'links',
      hint: '扫码添加飞书好友',
      keywords: ['feishu', 'lark', '飞书', '好友', 'qr', '联系方式'],
      url: resolveImageSrc('/images/contact/feishu.jpg'),
    },
    {
      id: 'zanshang',
      label: '赞赏码 / Tip Me',
      type: 'link',
      group: 'links',
      hint: '扫码赞赏支持',
      keywords: ['tip', 'donate', '赞赏', '打赏', '赞助', 'qr'],
      url: resolveImageSrc('/images/contact/zanshang.webp'),
    },
    {
      id: 'toggle-bgm',
      label: bgmPlaying ? '暂停背景音乐 / Pause BGM' : '播放背景音乐 / Play BGM',
      type: 'action' as const,
      group: 'actions' as const,
      hint: bgmPlaying ? '当前正在播放' : '启动背景音乐',
      keywords: ['bgm', 'music', 'audio', '音乐', '声音', '背景'],
    },
    {
      id: 'random-section',
      label: '随机漫游 / Random Section',
      type: 'action',
      group: 'actions',
      hint: '随便去一个还没看过的章节',
      keywords: ['random', 'shuffle', 'dice', '随机', '漫游', '骰子'],
    },
    {
      id: 'lucid-mode',
      label: lucidMode ? '退出灵光模式 / Exit Lucid Mode' : '灵光模式 / Lucid Mode',
      type: 'action' as const,
      group: 'actions' as const,
      hint: lucidMode ? '当前已开启，背景正在流转' : '让背景与主题色流转起来',
      keywords: ['lucid', 'konami', 'easter', '灵光', '彩蛋', 'overdrive'],
    },
    {
      id: 'zen-mode',
      label: zenMode ? '退出专注模式 / Exit Zen Mode' : '专注模式 / Zen Mode',
      type: 'action' as const,
      group: 'actions' as const,
      hint: zenMode ? '当前已开启，隐藏干扰元素' : '隐藏侧栏与导航，沉浸阅读',
      keywords: ['zen', 'focus', '专注', '阅读', '沉浸'],
    },
    ...MOTION_LEVEL_COMMANDS.map(({ level, label, hint }): Command => ({
      id: `motion-${level}`,
      label,
      type: 'action',
      group: 'actions',
      hint,
      keywords: ['motion', 'performance', '动效', '性能', '省电', level],
    })),
    ...(DESK_EMBED_ENABLED
      ? ([
          {
            id: 'mode-win95',
            label: '模式：Win95 像素桌面 / Mode: Win95 Desktop',
            type: 'action',
            group: 'actions',
            hint: '切换到融合桌面试验版（可随时切回）',
            keywords: ['win95', 'desktop', 'fusion', '桌面', '像素', '模式', '切换'],
          },
          {
            id: 'mode-classic',
            label: '模式：经典站点 / Mode: Classic Site',
            type: 'action',
            group: 'actions',
            hint: '回到经典全页滚动站点',
            keywords: ['classic', 'site', '经典', '站点', '模式', '切换'],
          },
        ] satisfies Command[])
      : []),
    {
      id: 'perf-auto',
      label: '动效：性能自动 / Perf: Auto',
      type: 'action',
      group: 'actions',
      hint: '恢复设备性能自适应（当前可能为手动固定档位）',
      keywords: ['perf', 'performance', 'auto', '性能', '自适应', '自动', '档位'],
    },
    {
      id: 'perf-full',
      label: '动效：完整渲染 / Perf: Full',
      type: 'action',
      group: 'actions',
      hint: '固定完整背景渲染，不自动降低装饰负载',
      keywords: ['perf', 'performance', 'full', '性能', '完整', '渲染'],
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  createDynamicCommands                                              */
/* ------------------------------------------------------------------ */

/**
 * Build the data‑driven command lists from profile data, projects, and
 * articles.  These change when the underlying data changes (e.g. after a
 * content collection rebuild or when switching locales in the future).
 */
export function createDynamicCommands({
  projects,
  articles,
}: {
  projects: readonly Project[];
  articles: readonly ArticleListItem[];
}): {
  projectCommands: Command[];
  tagCommands: Command[];
  skillCommands: Command[];
  honorCommands: Command[];
} {
  /* ---- project commands ---- */
  const projectCommands: Command[] = projects.map((p) => ({
    id: `project-${p.id}`,
    label: p.title,
    type: 'nav' as const,
    group: 'projects' as const,
    hint: truncate(p.description, 80),
    keywords: [p.title, p.description, p.id, ...p.tags],
    targetSection: 'projects',
    targetId: p.id,
  }));

  /* ---- tag commands (from article tags, deduped) ---- */
  const seen = new Set<string>();
  const tagCommands: Command[] = [];
  for (const a of articles) {
    for (const tag of a.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tagCommands.push({
        id: `tag-${tag}`,
        label: `#${tag}`,
        type: 'nav' as const,
        group: 'tags' as const,
        hint: `浏览标记为「${tag}」的文章`,
        keywords: [tag, '标签'],
      });
    }
  }
  tagCommands.sort((a, b) => a.label.localeCompare(b.label));

  /* ---- skill commands (static profile data) ---- */
  const skillCommands: Command[] = skills.map((s) => ({
    id: `skill-${s.name}`,
    label: s.name,
    type: 'nav' as const,
    group: 'skills' as const,
    hint: `${s.category} · ${s.years ? `${s.years}年 ` : ''}${s.note ?? ''}`,
    keywords: [s.name, s.category, s.note ?? ''].filter(Boolean),
    targetSection: 'skills',
    targetId: s.name,
  }));

  /* ---- honor commands (repaved onto about after IA merge) ---- */
  const honorCommands: Command[] = honors.map((h, index) => ({
    id: `honor-${index}`,
    label: h.title.length > 50 ? h.title.slice(0, 48) + '…' : h.title,
    type: 'nav' as const,
    group: 'honors' as const,
    hint: `${h.issuerShort ?? h.issuer} · ${h.level}`,
    keywords: [h.title, h.issuer, h.level, h.description, h.tier],
    targetSection: 'about',
    targetId: `honor-${index}`,
  }));

  return { projectCommands, tagCommands, skillCommands, honorCommands };
}

/* ------------------------------------------------------------------ */
/*  COMMAND_HANDLERS — static dispatch map                              */
/* ------------------------------------------------------------------ */

/**
 * Map from command id → handler.
 *
 * Static commands (nav, link, action) are covered here.  Dynamic commands
 * whose ids are generated at runtime (article‑*, tag-*, project-*,
 * skill-*, honor-*, copy‑result) are resolved by the component via a short
 * prefix‑based fallback **after** checking this map.
 */
export const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  /* ---- nav commands (section ids) ---- */
  about: (ctx) => ctx.navigate('about'),
  projects: (ctx) => ctx.navigate('projects'),
  skills: (ctx) => ctx.navigate('skills'),
  gallery: (ctx) => ctx.navigate('gallery'),
  blog: (ctx) => ctx.navigate('blog'),
  friends: (ctx) => ctx.navigate('friends'),

  /* ---- link commands ---- */
  github: (ctx) => ctx.openUrl(profile.github),
  bilibili: (ctx) => ctx.openUrl(profile.bilibili),
  email: (ctx) => ctx.openUrl(`mailto:${profile.email}`),
  'copy-email': (ctx) => ctx.copyToClipboard(profile.email),
  wechat: (ctx) => ctx.openContactQR(0),
  feishu: (ctx) => ctx.openContactQR(1),
  zanshang: (ctx) => ctx.openContactQR(2),

  /* ---- action commands ---- */
  'resume-pdf': (ctx) => ctx.openUrl('/resume?print=1'),
  'goto-home': (ctx) => ctx.navigate(ROOT_SECTION_ID),
  'goto-last': (ctx) => ctx.navigate(SECTIONS[SECTIONS.length - 1].id),
  'toggle-bgm': (ctx) => ctx.toggleBGM(),
  'random-section': (ctx) => {
    const candidates = SECTIONS.filter((section) => section.id !== ctx.currentSectionId);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    if (target) ctx.navigate(target.id);
  },
  'lucid-mode': (ctx) => ctx.toggleLucidMode(),
  'zen-mode': () => setZenMode(!getZenMode()),
  'motion-full': () => setMotionOverride('full'),
  'motion-mobile': () => setMotionOverride('mobile'),
  'motion-reduced': () => setMotionOverride('reduced'),
  'mode-win95': () => requestDisplayMode('win95'),
  'mode-classic': () => requestDisplayMode('classic'),
  'perf-auto': () => setPerfOverride('auto'),
  'perf-full': () => setPerfOverride('high'),
};

/* ------------------------------------------------------------------ */
/*  Dynamic‑command handler resolver (for use by the component)        */
/* ------------------------------------------------------------------ */

/**
 * Resolve a handler for commands whose ids are generated at runtime.
 *
 * Design note:
 *   The component calls this **after** checking `COMMAND_HANDLERS[command.id]`.
 *   `copy‑result` is intentionally excluded because its handler needs the
 *   *current* calculator value, which is ephemeral React state.  The component
 *   should handle `copy‑result` inline, calling `ctx.copyToClipboard(value)`.
 *
 * Returns `null` when the id does not start with a recognised dynamic prefix.
 */
export function resolveDynamicHandler(command: Command): CommandHandler | null {
  if (command.id.startsWith('article-')) {
    return (ctx) => {
      const slug = command.id.slice(8);
      ctx.navigateToArticle(slug);
    };
  }

  if (command.id.startsWith('tag-')) {
    return (ctx) => {
      const tag = command.id.slice(4);
      ctx.openUrl(`/blog/tag/${encodeURIComponent(tag)}`);
    };
  }

  if (command.id.startsWith('project-')) {
    return (ctx) => ctx.navigateToItem('projects', command.targetId ?? command.id);
  }

  if (command.id.startsWith('skill-')) {
    return (ctx) => ctx.navigateToItem('skills', command.targetId ?? command.id);
  }

  if (command.id.startsWith('honor-')) {
    return (ctx) => ctx.navigateToItem('about', command.targetId ?? command.id);
  }

  return null;
}
