import type { FileSelection, FileSelectionResult } from './app-contracts';

/** Own each native picker until selection, cancellation or host disposal. */
export function createBrowserFilePicker(root: HTMLElement) {
  const pending = new Set<FileSelection>();
  let disposed = false;
  return {
    pick(request: { accept: string }): FileSelection {
      const completion = Promise.withResolvers<FileSelectionResult>();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = request.accept;
      input.hidden = true;
      let settled = false;
      const finish = (result: FileSelectionResult) => {
        if (settled) return;
        settled = true;
        input.removeEventListener('change', changed);
        input.removeEventListener('cancel', cancelled);
        input.remove();
        pending.delete(selection);
        completion.resolve(result);
      };
      const changed = () => {
        const file = input.files?.[0];
        finish(file ? { status: 'selected', file } : { status: 'cancelled' });
      };
      const cancelled = () => finish({ status: 'cancelled' });
      const selection: FileSelection = { result: completion.promise, cancel: cancelled };
      if (disposed) {
        cancelled();
        return selection;
      }
      pending.add(selection);
      input.addEventListener('change', changed);
      input.addEventListener('cancel', cancelled);
      try {
        root.append(input);
        input.click();
      } catch {
        finish({ status: 'failed', error: 'The file picker could not be opened.' });
      }
      return selection;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const selection of pending) selection.cancel();
    },
  };
}
