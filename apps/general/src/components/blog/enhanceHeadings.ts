/**
 * Enhance article headings: append a copyable deep-link anchor (`.heading-anchor`)
 * to each `h2`/`h3`/`h4` that carries an `id`. Clicking copies the section's
 * canonical URL and updates the address-bar hash without triggering a scroll jump.
 *
 * Call after the article body is populated (React children on direct-load, or
 * fetched fragment HTML on in-app nav). Uses a data attribute guard to stay
 * idempotent and the same class names as `src/styles/features/blog/index.css`.
 */
export function enhanceHeadings(
  container: HTMLElement,
  onCopy?: (text: string) => void,
): () => void {
  const cleanups: Array<() => void> = [];
  let disposed = false;
  const headings = container.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]');

  headings.forEach((heading) => {
    if (heading.dataset.anchored) return;
    heading.dataset.anchored = 'true';

    const id = heading.id;
    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${id}`;
    anchor.textContent = '#';
    anchor.setAttribute('aria-label', '复制本节链接');
    anchor.dataset.cursor = 'COPY LINK';

    let resetTimer = 0;
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      const link = `${location.origin}${location.pathname}#${id}`;
      // Update the hash silently — no navigation/scroll jank.
      history.replaceState(null, '', `#${id}`);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(link).then(
          () => {
            if (disposed) return;
            anchor.dataset.copied = 'true';
            onCopy?.(link);
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(() => {
              anchor.dataset.copied = 'false';
            }, 1500);
          },
          () => {},
        );
      }
    };
    anchor.addEventListener('click', onClick);

    heading.appendChild(anchor);
    cleanups.push(() => {
      window.clearTimeout(resetTimer);
      anchor.removeEventListener('click', onClick);
      anchor.remove();
      delete heading.dataset.anchored;
    });
  });
  return () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
  };
}
