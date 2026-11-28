/**
 * Enhance `<pre>` code blocks: wrap each with a labeled, copyable chrome
 * (`.code-block` > `.code-block__bar` > `.code-block__lang` + `.code-block__copy`).
 *
 * 长代码块（行数 > CODE_BLOCK_COLLAPSE_THRESHOLD）默认折叠：`.code-block`
 * 加 `is-collapsed` 类（CSS 限高 + 底部渐变遮罩），bar 右侧提供
 * 「展开 / 折叠」切换按钮（`.code-block__toggle`）。语言标签附带行数。
 *
 * Ported from the old `BlogLayout.astro` inline script so it works inside the
 * SPA article reading mode — call it after the article body is populated
 * (React children on direct-load, or `<template>` innerHTML on in-app nav).
 * Uses the same class names as `src/styles/features/blog/index.css`.
 */

/** 超过该行数的代码块才启用折叠。 */
export const CODE_BLOCK_COLLAPSE_THRESHOLD = 12;

/** 统计行数：只数换行符，不分配整行数组。 */
function countLines(text: string): number {
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

export function enhanceCodeBlocks(container: ParentNode = document): () => void {
  const cleanups: Array<() => void> = [];
  let disposed = false;
  const nodes = Array.from(container.querySelectorAll('pre:not(.code-block-enhanced)'));
  if (nodes.length === 0) return () => {};

  for (const pre of nodes) {
    pre.classList.add('code-block-enhanced');

    const code = pre.querySelector('code');
    let lang = pre.getAttribute('data-language') ?? '';
    if (!lang && code) {
      const match = code.className.match(/language-([\w-]+)/);
      if (match) lang = match[1];
    }

    const codeText = code ? code.textContent : pre.textContent;
    const lineCount = countLines(codeText ?? '');

    const wrap = document.createElement('div');
    wrap.className = 'code-block';

    const bar = document.createElement('div');
    bar.className = 'code-block__bar';

    const langEl = document.createElement('span');
    langEl.className = 'code-block__lang';
    langEl.textContent = `${lang || 'code'} · ${lineCount} 行`;

    const btn = document.createElement('button');
    btn.className = 'code-block__copy';
    btn.type = 'button';
    btn.textContent = '复制';
    btn.dataset.cursor = 'COPY';
    let resetTimer = 0;
    const copy = () => {
      const text = code ? code.textContent : pre.textContent;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text ?? '').then(
          () => {
            if (disposed) return;
            btn.dataset.copied = 'true';
            btn.textContent = '已复制';
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(() => {
              btn.dataset.copied = 'false';
              btn.textContent = '复制';
            }, 1500);
          },
          () => {},
        );
      }
    };
    btn.addEventListener('click', copy);
    cleanups.push(() => {
      window.clearTimeout(resetTimer);
      btn.removeEventListener('click', copy);
      if (pre.parentNode === wrap && wrap.parentNode) wrap.replaceWith(pre);
      pre.classList.remove('code-block-enhanced');
    });

    bar.appendChild(langEl);

    // 长块折叠：bar 右侧「展开 / 折叠」按钮 + 复制按钮。
    if (lineCount > CODE_BLOCK_COLLAPSE_THRESHOLD) {
      const actions = document.createElement('div');
      actions.className = 'code-block__bar-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'code-block__toggle';
      const applyCollapsed = (collapsed: boolean) => {
        wrap.classList.toggle('is-collapsed', collapsed);
        toggleBtn.textContent = collapsed ? '展开' : '折叠';
        toggleBtn.dataset.cursor = collapsed ? 'EXPAND' : 'COLLAPSE';
        // 折叠态仍展示前 20rem，不是 hidden；aria-expanded 让读屏用户知道
        // 当前按钮是「展开」还是「收起」。
        toggleBtn.setAttribute('aria-expanded', String(!collapsed));
      };
      const toggle = () => {
        applyCollapsed(!wrap.classList.contains('is-collapsed'));
      };
      toggleBtn.addEventListener('click', toggle);
      cleanups.push(() => toggleBtn.removeEventListener('click', toggle));

      actions.appendChild(toggleBtn);
      actions.appendChild(btn);
      bar.appendChild(actions);
      applyCollapsed(true);
    } else {
      bar.appendChild(btn);
    }

    if (pre.parentNode) {
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(bar);
      wrap.appendChild(pre);
    }
  }
  return () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
  };
}
