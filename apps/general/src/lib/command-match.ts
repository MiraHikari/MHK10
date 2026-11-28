/**
 * 命令面板的匹配评分与高亮工具。
 * `matchScore` 是全站「顺序子序列」fuzzy 匹配的唯一实现：
 * 命令面板、技能筛选共用（`!== null` 即布尔判定）。
 */

/**
 * 顺序 fuzzy 匹配评分:不匹配返回 null;分数越低越好。
 * 起始越靠前、命中越紧凑,分数越低;目标越长略微扣分(短标题优先)。
 */
export function matchScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;

  let qi = 0;
  let start = -1;
  let gaps = 0;
  let lastHit = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (start === -1) start = ti;
      if (lastHit !== -1) gaps += ti - lastHit - 1;
      lastHit = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;

  return start * 2 + gaps + t.length * 0.01;
}

export interface MatchSegment {
  readonly text: string;
  readonly matched: boolean;
}

/**
 * 按顺序 fuzzy 匹配把 text 切成命中/未命中分段,用于结果高亮。
 * query 为空、或顺序匹配无法覆盖整个 query(如 Fuse 命中的文章标题)时,
 * 返回单段不高亮。
 */
export function highlightSegments(text: string, query: string): MatchSegment[] {
  const q = query.trim().toLowerCase();
  if (!q || !text) return [{ text, matched: false }];

  const lower = text.toLowerCase();
  const segments: MatchSegment[] = [];
  let qi = 0;
  let buf = '';
  let bufMatched = false;

  const flush = () => {
    if (buf) segments.push({ text: buf, matched: bufMatched });
    buf = '';
  };

  for (let i = 0; i < text.length; i++) {
    const hit = qi < q.length && lower[i] === q[qi];
    if (hit) qi++;
    if (hit !== bufMatched) flush();
    bufMatched = hit;
    buf += text[i];
  }
  flush();

  if (qi < q.length) return [{ text, matched: false }];
  return segments;
}
