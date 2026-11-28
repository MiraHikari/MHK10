import { useEffect } from 'react';

export interface CommandTarget {
  readonly sectionId: string;
  readonly itemId: string;
  readonly nonce: number;
}

function findTargetElement(itemId: string) {
  const elements = document.querySelectorAll<HTMLElement>('[data-command-target]');
  const matches = Array.from(elements).filter(
    (element) => element.dataset.commandTarget === itemId,
  );

  return matches.find((element) => element.getClientRects().length > 0) ?? matches[0] ?? null;
}

export function useCommandTargetHighlight(
  sectionId: string,
  isReady: boolean,
  target?: CommandTarget | null,
) {
  useEffect(() => {
    if (!isReady || target?.sectionId !== sectionId) return;

    // 内部 2200ms 移除计时器也纳入 cleanup：外层 effect 触发后组件卸载时
    // 不残留对已卸载元素的操作。
    let clearHighlightTimer = 0;
    let highlighted: HTMLElement | null = null;
    const timeoutId = window.setTimeout(() => {
      const element = findTargetElement(target.itemId);
      if (!element) return;

      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('command-target-highlight');
      highlighted = element;
      clearHighlightTimer = window.setTimeout(() => {
        element.classList.remove('command-target-highlight');
      }, 2200);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(clearHighlightTimer);
      highlighted?.classList.remove('command-target-highlight');
    };
  }, [isReady, sectionId, target]);
}
