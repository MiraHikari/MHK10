import { useDeferredValue, useMemo } from 'react';
import {
  type Command,
  type CommandGroup,
  truncate,
  parseQueryPrefix,
  computeCalcInfo,
  groupLabel,
} from '@/lib/command-registry';
import { matchScore } from '@/lib/command-match';
import { searchArticles, type SearchableArticle } from '@/lib/blog/search';
import type { ArticleListItem } from '@/lib/blog/types';

type CalcInfo = NonNullable<ReturnType<typeof computeCalcInfo>>;

function isCommand(command: Command | undefined): command is Command {
  return command !== undefined;
}

function isNonEmptyString(value: string): value is string {
  return value.length > 0;
}

function isArticleBrowseQuery(query: string): boolean {
  return ['blog', 'blogs', 'article', 'articles', '博客', '文章'].includes(
    query.trim().toLowerCase(),
  );
}

function toArticleCommand(article: SearchableArticle): Command {
  return {
    id: `article-${article.id}`,
    label: article.title,
    type: 'nav' as const,
    group: 'articles' as const,
    hint: article.description?.slice(0, 80) ?? '',
    keywords: [
      article.title,
      article.description ?? '',
      article.id,
      ...(article.tags ?? []),
    ].filter(isNonEmptyString),
  };
}

/* ------------------------------------------------------------------ */
/*  Options & result types                                            */
/* ------------------------------------------------------------------ */

export interface UseCommandSearchOptions {
  query: string;
  staticCommands: Command[];
  projectCommands: Command[];
  tagCommands: Command[];
  skillCommands: Command[];
  honorCommands: Command[];
  articles: readonly ArticleListItem[];
  recents: string[];
  recentArticleSlugs: string[];
  copied: boolean;
}

export interface UseCommandSearchResult {
  filtered: Command[];
  groups: { label: string; commands: Command[] }[];
  calcInfo: CalcInfo | null;
  isStale: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useCommandSearch(options: UseCommandSearchOptions): UseCommandSearchResult {
  const {
    query,
    staticCommands,
    projectCommands,
    tagCommands,
    skillCommands,
    honorCommands,
    articles,
    recents,
    recentArticleSlugs,
    copied,
  } = options;

  // 每键击的 fuzzy + Fuse 全文搜索推迟到空闲渲染：输入保持即时响应，
  // 结果列表可能短暂滞后；调用方在同步前必须禁止执行旧结果。
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  /* ---- calculator ---- */
  const calcInfo = useMemo(() => computeCalcInfo(deferredQuery), [deferredQuery]);

  /* ---- prefix-aware filtered results ---- */
  const filtered = useMemo(() => {
    const parsed = parseQueryPrefix(deferredQuery);
    const q = parsed.term.toLowerCase();
    const activePrefix = parsed.prefix;

    /* -- helper: fuzzy filter + score a command list -- */
    const fuzzyFilter = (cmds: readonly Command[]) => {
      if (!q) return cmds;
      return cmds
        .map((cmd) => {
          const haystack = [cmd.id, cmd.label, cmd.hint, cmd.path, cmd.url, ...(cmd.keywords ?? [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          // 标签命中优先于关键词/路径命中;分数越低排越前。
          // matchScore 不匹配时返回 null,兼作过滤。
          const score = matchScore(q, cmd.label) ?? matchScore(q, haystack);
          if (score === null) return null;
          return { cmd, score };
        })
        .filter((entry): entry is { cmd: Command; score: number } => entry !== null)
        .sort((a, b) => a.score - b.score)
        .map((entry) => entry.cmd);
    };

    /* -- calculator (always first when active) -- */
    let calcCommand: Command[] = [];
    if (calcInfo?.ok) {
      calcCommand = [
        {
          id: 'copy-result',
          label: `复制结果 ${calcInfo.value}`,
          type: 'action',
          group: 'actions',
          hint: copied ? '已复制到剪贴板' : '按 Enter 复制到剪贴板',
          keywords: ['calc', '计算', 'calculator', 'copy', 'result'],
        },
      ];
    }

    /* === no query at all === */
    if (!deferredQuery.trim()) {
      const recentSet = new Set(recents);
      const recent = recents.map((id) => staticCommands.find((c) => c.id === id)).filter(isCommand);
      const rest = staticCommands.filter((c) => !recentSet.has(c.id));

      /* recent articles (top 3) */
      const recentArticles = recentArticleSlugs
        .map((slug) => articles.find((a) => a.id === slug))
        .filter((a): a is ArticleListItem => Boolean(a))
        .slice(0, 3)
        .map((a): Command => ({
          id: `article-${a.id}`,
          label: a.title,
          type: 'nav',
          group: 'articles',
          hint: truncate(a.description, 80),
          keywords: [a.title, a.description],
        }));

      return [...recentArticles, ...recent, ...rest];
    }

    /* === prefix: :cmd or : — only static commands === */
    if (activePrefix === 'cmd') {
      return [...calcCommand, ...fuzzyFilter(staticCommands)];
    }

    /* === prefix: :blog / :article — only articles === */
    if (activePrefix === 'blog') {
      const term = parsed.term.trim();
      const articleMatches: Command[] = term
        ? searchArticles(articles, term).map((r) => toArticleCommand(r.item))
        : articles.map(toArticleCommand);
      return [...calcCommand, ...articleMatches];
    }

    /* === prefix: :project — only projects === */
    if (activePrefix === 'project') {
      return [...calcCommand, ...fuzzyFilter(projectCommands)];
    }

    /* === prefix: :tag — only tags === */
    if (activePrefix === 'tag') {
      return [...calcCommand, ...fuzzyFilter(tagCommands)];
    }

    /* === prefix: :skill — only skills === */
    if (activePrefix === 'skill') {
      return [...calcCommand, ...fuzzyFilter(skillCommands)];
    }

    /* === prefix: :honor — only honors === */
    if (activePrefix === 'honor') {
      return [...calcCommand, ...fuzzyFilter(honorCommands)];
    }

    /* === no prefix — search across all categories === */
    // Rank: static first, then articles, projects, tags, skills, honors
    const staticMatches = fuzzyFilter(staticCommands);
    const projectMatches = fuzzyFilter(projectCommands);
    const tagMatches = fuzzyFilter(tagCommands);
    const skillMatches = fuzzyFilter(skillCommands);
    const honorMatches = fuzzyFilter(honorCommands);

    /* full-text article search via Fuse.js */
    const articleMatches: Command[] = isArticleBrowseQuery(deferredQuery)
      ? articles.map(toArticleCommand)
      : searchArticles(articles, deferredQuery.trim()).map((r) => toArticleCommand(r.item));

    return [
      ...calcCommand,
      ...staticMatches,
      ...articleMatches,
      ...projectMatches,
      ...tagMatches,
      ...skillMatches,
      ...honorMatches,
    ];
  }, [
    deferredQuery,
    staticCommands,
    recents,
    projectCommands,
    tagCommands,
    skillCommands,
    honorCommands,
    calcInfo,
    recentArticleSlugs,
    articles,
    copied,
  ]);

  /* ---- group results for display ---- */
  const groups = useMemo(() => {
    const q = deferredQuery.trim();
    const parsed = parseQueryPrefix(q);

    // If a specific prefix is active, show as a single labelled group
    if (parsed.prefix) {
      const prefixLabels: Record<string, string> = {
        cmd: '命令',
        blog: '文章',
        project: '项目',
        tag: '标签',
        skill: '技能',
        honor: '荣誉',
      };
      const label = prefixLabels[parsed.prefix] ?? '结果';
      if (filtered.length === 0) return [{ label: `:${parsed.prefix}`, commands: [] }];
      return [{ label, commands: filtered }];
    }

    // No query: show groups in curation order
    if (!q) {
      const recentSet = new Set(recents);
      const recentCmds = filtered.filter((c) => recentSet.has(c.id));
      const byGroup = Map.groupBy(
        filtered.filter((c) => !recentSet.has(c.id)),
        (c) => c.group,
      );

      const groupsList: { label: string; commands: Command[] }[] = [];
      if (recentCmds.length > 0) {
        groupsList.push({ label: '最近使用', commands: recentCmds });
      }
      const order: CommandGroup[] = ['articles', 'pages', 'links', 'actions'];
      for (const g of order) {
        const cmds = byGroup.get(g);
        if (cmds) groupsList.push({ label: groupLabel(g), commands: cmds });
      }
      return groupsList;
    }

    // Has query, no prefix: group by category. One grouping pass instead of
    // one filter pass per group (this runs per deferred keystroke).
    const order: CommandGroup[] = [
      'pages',
      'actions',
      'links',
      'articles',
      'projects',
      'tags',
      'skills',
      'honors',
    ];
    const byGroup = Map.groupBy(filtered, (command) => command.group);
    return order.flatMap((group) => {
      const commands = byGroup.get(group);
      return commands ? [{ label: groupLabel(group), commands }] : [];
    });
  }, [filtered, deferredQuery, recents]);

  return { filtered, groups, calcInfo, isStale };
}
