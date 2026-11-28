/**
 * 脚注内联弹层增强器：点击 GFM 脚注引用（`a[role="doc-noteref"]` /
 * `a[data-footnote-ref]`）在所在块之后展开 `.footnote-inline` 面板，
 * 克隆文末脚注内容（保留内部链接），单开互斥。
 *
 * 兼容两种 id 格式（`fn-1` / `user-content-fn-1`）；解析不到脚注时放行
 * 默认锚点跳转。返回 disposer，由 ArticleView 的 effect cleanup 调用。
 */

const REF_SELECTOR = 'a[role="doc-noteref"], a[data-footnote-ref]';

interface ActivePanel {
  ref: HTMLAnchorElement;
  panel: HTMLDivElement;
}

export function enhanceFootnotes(container: ParentNode = document): () => void {
  const refs = container.querySelectorAll<HTMLAnchorElement>(REF_SELECTOR);
  if (refs.length === 0) return () => {};

  let active: ActivePanel | null = null;

  const close = () => {
    if (!active) return;
    active.ref.removeAttribute('data-footnote-open');
    active.panel.remove();
    active = null;
  };

  const openPanel = (ref: HTMLAnchorElement, footnote: HTMLElement) => {
    close();
    const host = ref.closest('p, li, blockquote, h2, h3, h4') ?? ref.parentElement;
    if (!host) return;

    const panel = document.createElement('div');
    panel.className = 'footnote-inline';
    panel.setAttribute('role', 'note');

    const bar = document.createElement('div');
    bar.className = 'footnote-inline__bar';
    const label = document.createElement('span');
    label.className = 'footnote-inline__label';
    const number = footnote.id.match(/(\d+)$/)?.[1] ?? '';
    label.textContent = number ? `注 ${number}` : '脚注';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'footnote-inline__close';
    closeBtn.setAttribute('aria-label', '关闭脚注');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', close);
    bar.appendChild(label);
    bar.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'footnote-inline__body';
    for (const child of Array.from(footnote.childNodes)) {
      const clone = child.cloneNode(true);
      // 去掉回链（↩），保留正文与内部链接。
      if (clone instanceof Element) {
        clone
          .querySelectorAll(
            'a[data-footnote-backref], a.reversefootnote, a[aria-label^="Back to reference"]',
          )
          .forEach((backref) => backref.remove());
      }
      body.appendChild(clone);
    }

    panel.appendChild(bar);
    panel.appendChild(body);
    host.after(panel);
    ref.setAttribute('data-footnote-open', '');
    active = { ref, panel };
  };

  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const ref = target?.closest<HTMLAnchorElement>(REF_SELECTOR);
    if (!ref || !container.contains(ref)) return;
    if (active?.ref === ref) {
      event.preventDefault();
      close();
      return;
    }
    const hash = ref.getAttribute('href')?.split('#')[1] ?? '';
    const id = hash.replace(/^user-content-/, '');
    const footnote = id ? document.getElementById(id) : null;
    // 找不到脚注节点：不 preventDefault，放行默认锚点跳转。
    if (!footnote) return;
    event.preventDefault();
    openPanel(ref, footnote as HTMLElement);
  };
  container.addEventListener('click', onClick);

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!active) return;
    const target = event.target as Node | null;
    if (target && active.panel.contains(target)) return;
    close();
  };
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown);

  return () => {
    container.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('pointerdown', onPointerDown);
    close();
  };
}
