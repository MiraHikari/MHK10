import type { createFileSystem } from './filesystem';
import { defaultSaveFolder, isWritableSaveFolder, writableSaveFolders } from './save-target-model';
import type { SaveText, SaveTextResult } from './save-request';
import { createLifetime } from '../../ui/browser/lifetime';

/** DOM adapter for the same local-document save operation used by the canvas picker. */
export function createDomSavePicker(
  parent: HTMLElement,
  files: ReturnType<typeof createFileSystem>,
) {
  const lifetime = createLifetime();
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'save-document-title');
  dialog.dataset.savePicker = '';
  const title = document.createElement('h2');
  title.id = 'save-document-title';
  title.textContent = 'Save As';
  const form = document.createElement('form');
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'File name';
  const name = document.createElement('input');
  name.name = 'filename';
  name.required = true;
  name.maxLength = 64;
  nameLabel.append(name);
  const folderLabel = document.createElement('label');
  folderLabel.textContent = 'Save in';
  const folder = document.createElement('select');
  folder.name = 'folder';
  const refreshFolders = () => {
    folder.replaceChildren();
    for (const entry of writableSaveFolders(files.folders())) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      folder.append(option);
    }
  };
  folderLabel.append(folder);
  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  form.append(folderLabel, nameLabel, notice, save, cancel);
  dialog.append(title, form);
  parent.append(dialog);
  let pending:
    | { content: string; complete(result: SaveTextResult): void; promise: Promise<SaveTextResult> }
    | undefined;
  let confirmed:
    | { id: string; version: number | undefined; name: string; folder: string }
    | undefined;
  let epoch = files.epoch;
  const finish = (result: SaveTextResult) => {
    const request = pending;
    pending = undefined;
    confirmed = undefined;
    if (dialog.open) dialog.close();
    request?.complete(result);
  };
  const resetConfirmation = () => {
    confirmed = undefined;
    save.textContent = 'Save';
    notice.textContent = 'Ready';
  };
  lifetime.listen(name, 'input', resetConfirmation);
  lifetime.listen(folder, 'change', resetConfirmation);
  lifetime.listen(cancel, 'click', () => finish({ status: 'cancelled' }));
  lifetime.listen(dialog, 'cancel', (event) => {
    event.preventDefault();
    finish({ status: 'cancelled' });
  });
  lifetime.listen(form, 'submit', (event) => {
    event.preventDefault();
    if (!pending) return;
    if (epoch !== files.epoch) {
      confirmed = undefined;
      epoch = files.epoch;
      refreshFolders();
      notice.textContent =
        'My Documents was reset. Choose a name and save again to keep this copy.';
      save.textContent = 'Save';
      return;
    }
    if (!isWritableSaveFolder(files.folders(), folder.value)) {
      notice.textContent = 'Choose a writable destination folder.';
      return;
    }
    const selected = folder.value;
    const target = files.findByName(name.value, selected);
    if (
      target &&
      (!confirmed ||
        confirmed.id !== target.id ||
        confirmed.name !== name.value ||
        confirmed.folder !== selected)
    ) {
      confirmed = {
        id: target.id,
        version: files.getVersion(target.id),
        name: name.value,
        folder: selected,
      };
      notice.textContent = `${target.name} already exists. Choose Replace to overwrite it, or change the name.`;
      save.textContent = 'Replace';
      return;
    }
    const result = files.saveTextAs(
      name.value,
      pending.content,
      selected,
      confirmed ? { overwriteId: confirmed.id, expectedVersion: confirmed.version } : {},
    );
    if (!result.ok || !result.file) {
      notice.textContent = result.error ?? 'The file could not be saved.';
      confirmed = undefined;
      save.textContent = 'Save';
      return;
    }
    if (!result.persisted) {
      confirmed = {
        id: result.file.id,
        version: files.getVersion(result.file.id),
        name: name.value,
        folder: selected,
      };
      notice.textContent =
        files.notice ||
        'Storage is unavailable. Your session copy is kept. Retry saving, or cancel and export your document.';
      save.textContent = 'Retry save';
      return;
    }
    finish({ status: 'saved', file: result.file, persisted: true });
  });
  lifetime.defer(() => {
    finish({ status: 'cancelled' });
    dialog.remove();
  });
  const saveText: SaveText = (request) => {
    if (lifetime.disposed)
      return Promise.resolve({ status: 'failed', error: 'The application has been closed.' });
    if (pending)
      return Promise.resolve({ status: 'failed', error: 'Finish the open Save As dialog first.' });
    const { promise, resolve: complete } = Promise.withResolvers<SaveTextResult>();
    pending = { content: request.content, complete, promise };
    epoch = files.epoch;
    name.value = request.name;
    refreshFolders();
    folder.value = defaultSaveFolder(files.folders(), request.folder);
    resetConfirmation();
    dialog.showModal();
    name.focus();
    name.select();
    return promise;
  };
  return {
    saveText,
    get open() {
      return !!pending;
    },
    dispose: lifetime.dispose,
  };
}
