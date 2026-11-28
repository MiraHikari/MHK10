/**
 * Kindle 式段落高亮：把选区换算成「块索引 + 块内字符偏移」的 marker，之后
 * 可脱离选区状态重建 `<mark class="reading-highlight">` 包裹。
 *
 * 核心算法（偏移映射 / 校验 / 钳制）不依赖 DOM，可直接单测；capture /
 * apply 是薄 DOM 适配层，供 useArticleHighlights 在正文就绪后调用。
 * 块内文本与 marker.text 不匹配（内容改版）的条目会被跳过（skipped），
 * 不会污染正文。
 */

/** 单条高亮上限（字符）。 */
export const MAX_HIGHLIGHT_LENGTH = 500;

/** 选区在文章正文块级元素上的落点。 */
export interface HighlightMarker {
  /**
   * Shared notebook identity. `captureHighlightMarker` never sets it: selection
   * captures only feed the `addArticleNote` input, while markers carrying a
   * noteId are rebuilt from notebook records in `markersForNotes`.
   */
  noteId?: string;
  /** 块在 container 直属子元素中的索引（container.children 下标）。 */
  p: number;
  /** 块 textContent 内的起始字符偏移（含）。 */
  start: number;
  /** 块 textContent 内的结束字符偏移（不含）。 */
  end: number;
  /** 捕获时的选区文本（trim，≤ MAX_HIGHLIGHT_LENGTH），用于内容改版后的校验。 */
  text: string;
}

/** 文本节点序列中的一段（绝对偏移 + 文本），供纯函数做区间映射。 */
export interface TextSegment {
  start: number;
  text: string;
}

/** 一次应用的产物；skipped 表示该条因内容不匹配/越界被跳过。 */
export interface AppliedHighlight {
  marker: HighlightMarker;
  element?: HTMLElement;
  skipped?: boolean;
}

/** 钳制偏移到 [0, length]。 */
export function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(length, Math.max(0, Math.round(offset)));
}

/**
 * 把 [start, end) 字符偏移映射到文本节点序列上的若干段。
 * 纯函数：nodes 需按 start 升序、互不重叠。
 */
export function mapOffsetsToRuns(
  nodes: ReadonlyArray<TextSegment>,
  start: number,
  end: number,
): Array<{ nodeIndex: number; from: number; to: number }> {
  const runs: Array<{ nodeIndex: number; from: number; to: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const segment = nodes[i];
    const segmentEnd = segment.start + segment.text.length;
    if (segmentEnd <= start) continue;
    if (segment.start >= end) break;
    const from = Math.max(0, start - segment.start);
    const to = Math.min(segment.text.length, end - segment.start);
    if (to > from) runs.push({ nodeIndex: i, from, to });
  }
  return runs;
}

/**
 * 把 marker 的偏移解析到块文本上：先按原偏移钳制取值，trim 后与 marker.text
 * 对比；不匹配（选区跨空白、正文微调）则退回 indexOf 定位；仍找不到返回 null。
 */
export function resolveMarkerOffsets(
  blockText: string,
  marker: HighlightMarker,
): { start: number; end: number } | null {
  const { start, end, text } = marker;
  const clampedStart = clampOffset(start, blockText.length);
  const clampedEnd = clampOffset(end, blockText.length);
  if (clampedEnd <= clampedStart || !text) return null;
  const slice = blockText.slice(clampedStart, clampedEnd);
  if (slice === text || slice.trim() === text) {
    return { start: clampedStart, end: clampedEnd };
  }
  const found = blockText.indexOf(text);
  if (found !== -1) {
    return { start: found, end: Math.min(blockText.length, found + text.length) };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  DOM 适配层                                                         */
/* ------------------------------------------------------------------ */

const BLOCK_SELECTOR = 'p, li, h2, h3, h4, blockquote, pre';

/** 单次 TreeWalker 同时产出段序列与文本节点数组（行为与分两次遍历一致）。 */
function collectTextRuns(root: Node): { segments: TextSegment[]; nodes: Text[] } {
  const segments: TextSegment[] = [];
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? '';
    if (text) {
      segments.push({ start: offset, text });
      nodes.push(node as Text);
    }
    offset += text.length;
    node = walker.nextNode();
  }
  return { segments, nodes };
}

/**
 * 定位选区锚点所在的块级元素，并提升为 container 的直属子元素，
 * 保证返回的 p 与 container.children 下标一致。
 */
function findAnchorBlock(container: ParentNode, selection: Selection): HTMLElement | null {
  const anchor = selection.anchorNode;
  if (!anchor) return null;
  const candidate =
    anchor instanceof Element
      ? anchor.closest<HTMLElement>(BLOCK_SELECTOR)
      : anchor.parentElement?.closest<HTMLElement>(BLOCK_SELECTOR);
  let block = candidate && container.contains(candidate) ? candidate : null;
  if (!block) return null;
  while (block.parentNode !== container) {
    const parent = block.parentNode;
    if (!parent || !container.contains(parent)) return null;
    block = parent as HTMLElement;
  }
  return block;
}

/** 计算 range 端点相对 block 文本起点的偏移。 */
function rangeOffsetInBlock(block: HTMLElement, containerNode: Node, offset: number): number {
  const prefix = document.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(containerNode, offset);
  return prefix.toString().length;
}

/**
 * 从当前选区捕获一个高亮 marker。选区需完全落在同一块级元素内；
 * 锚点不在正文块、选区跨块或文本为空时返回 null。
 */
export function captureHighlightMarker(
  container: ParentNode,
  selection: Selection,
): HighlightMarker | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;
  const block = findAnchorBlock(container, selection);
  if (!block) return null;
  // 跨块选区不捕获：p 偏移只对单块有效。
  if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) {
    return null;
  }
  const rawStart = rangeOffsetInBlock(block, range.startContainer, range.startOffset);
  const end = rangeOffsetInBlock(block, range.endContainer, range.endOffset);
  if (end <= rawStart) return null;
  const p = Array.from(container.children).indexOf(block);
  if (p < 0) return null;
  const raw = range.toString();
  const text = raw.trim();
  if (!text || text.length > MAX_HIGHLIGHT_LENGTH) return null;
  const start = rawStart + raw.length - raw.trimStart().length;
  return { p, start, end: start + text.length, text };
}

/** 还原所有已包裹的高亮 mark（替换回其文本子节点）。 */
export function removeHighlightMarks(container: ParentNode): void {
  container.querySelectorAll('mark.reading-highlight').forEach((mark) => {
    mark.replaceWith(...mark.childNodes);
  });
}

function wrapRun(node: Text, from: number, to: number, index: number): HTMLElement {
  const mark = document.createElement('mark');
  mark.className = 'reading-highlight';
  mark.dataset.highlightIndex = String(index);
  if (from === 0 && to === node.data.length) {
    node.parentNode?.replaceChild(mark, node);
    mark.appendChild(node);
  } else if (from === 0) {
    const tail = node.splitText(to);
    node.parentNode?.insertBefore(mark, tail);
    mark.appendChild(node);
  } else {
    const mid = node.splitText(from);
    const tail = mid.splitText(to - from);
    mid.parentNode?.insertBefore(mark, tail);
    mark.appendChild(mid);
  }
  return mark;
}

/**
 * 按 markers 在 container 中重建高亮。幂等：应用前先还原既有 mark。
 * 单条无法定位（块不存在 / 文本不匹配 / 区间为空）或与同块已应用区间
 * 重叠时标记 skipped，不影响其余条目。
 */
export function applyHighlightMarkers(
  container: ParentNode,
  markers: ReadonlyArray<HighlightMarker>,
): AppliedHighlight[] {
  removeHighlightMarks(container);
  const results: AppliedHighlight[] = [];
  const children = Array.from(container.children);
  /** 同块已应用区间，防止嵌套包裹。 */
  const blockIntervals = new Map<number, Array<[number, number]>>();

  markers.forEach((marker, index) => {
    const block = children[marker.p];
    if (!(block instanceof HTMLElement)) {
      results.push({ marker, skipped: true });
      return;
    }
    const blockText = block.textContent ?? '';
    const resolved = resolveMarkerOffsets(blockText, marker);
    if (!resolved) {
      results.push({ marker, skipped: true });
      return;
    }
    const intervals = blockIntervals.get(marker.p) ?? [];
    if (intervals.some(([start, end]) => resolved.start < end && resolved.end > start)) {
      results.push({ marker, skipped: true });
      return;
    }
    intervals.push([resolved.start, resolved.end]);
    blockIntervals.set(marker.p, intervals);

    const { segments, nodes: textNodes } = collectTextRuns(block);
    const runs = mapOffsetsToRuns(segments, resolved.start, resolved.end);
    if (runs.length === 0) {
      results.push({ marker, skipped: true });
      return;
    }

    let firstElement: HTMLElement | undefined;
    for (const run of runs) {
      const node = textNodes[run.nodeIndex];
      if (!(node instanceof Text) || run.to <= run.from) continue;
      const mark = wrapRun(node, run.from, run.to, index);
      if (marker.noteId) mark.dataset.noteId = marker.noteId;
      firstElement ??= mark;
    }
    results.push(firstElement ? { marker, element: firstElement } : { marker, skipped: true });
  });

  return results;
}
