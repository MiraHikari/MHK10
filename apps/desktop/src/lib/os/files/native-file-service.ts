import type { FileSystem, FolderId, SandboxFile } from './filesystem';
import type { SaveText } from './save-request';
import type { NativeFileResult, NativeFileServices, NativeTextFile } from './native-file-bridge';

type AssetFile = SandboxFile & {
  kind?: 'text' | 'image' | 'audio' | 'shortcut';
  assetId?: string;
  mime?: string;
};
export function createNativeFileServices(
  files: FileSystem,
  saveAs: SaveText,
  openFile: (id: string, application?: string) => { accepted: boolean },
  readAsset?: (file: AssetFile) => Promise<Blob | undefined>,
): NativeFileServices {
  const failed = (error: string): NativeFileResult => ({ status: 'failed', error });
  const textView = (file: SandboxFile): NativeTextFile => ({
    kind: 'text',
    id: file.id,
    title: file.name,
    text: file.content,
    revision: files.getVersion(file.id) ?? 0,
    readonly: file.readonly,
  });
  return {
    async read(id) {
      const file: AssetFile | undefined = files.get(id);
      if (!file || file.deleted) return failed('The file is missing or in Recycle Bin.');
      if (file.kind === 'image' || file.kind === 'audio') {
        const revision = files.getVersion(id);
        let blob: Blob | undefined;
        try {
          blob = await readAsset?.(file);
        } catch {
          return failed('The file data could not be loaded.');
        }
        const current = files.get(id);
        if (
          !current ||
          current.deleted ||
          files.getVersion(id) !== revision ||
          current.assetId !== file.assetId
        )
          return failed('The file changed while its data was loading. Reopen the file.');
        return blob
          ? {
              status: 'read',
              file: {
                kind: file.kind,
                id: file.id,
                title: file.name,
                blob,
                mime: file.mime ?? blob.type,
                readonly: file.readonly,
                revision: revision ?? 0,
              },
            }
          : failed('The file data is unavailable.');
      }
      if (file.kind === 'shortcut') return failed('Open the shortcut to read its target.');
      const revision = files.getVersion(id);
      const loaded = await files.readText(id);
      if (!loaded.ok) return failed(loaded.error);
      const current = files.get(id);
      if (!current || current.deleted || files.getVersion(id) !== revision)
        return failed('The file changed while its text was loading. Reopen the file.');
      return { status: 'read', file: textView({ ...file, content: loaded.text }) };
    },
    write(id, content, revision) {
      const file: AssetFile | undefined = files.get(id);
      if (!file || file.deleted || file.readonly || (file.kind && file.kind !== 'text'))
        return failed('This file cannot be edited as text.');
      const result = files.writeText(id, content, { expectedVersion: revision });
      return result.ok && result.file
        ? { status: 'saved', file: textView(result.file), persisted: result.persisted }
        : failed(result.error ?? 'The file could not be saved.');
    },
    async saveAs(name, content, folder) {
      if (folder !== undefined && !files.folders().some((item) => item.id === folder))
        return failed('The destination folder no longer exists.');
      const result = await saveAs({ name, content, folder: folder as FolderId | undefined });
      return result.status === 'saved'
        ? { status: 'saved', file: textView(result.file), persisted: result.persisted }
        : result;
    },
    open(id, application) {
      return openFile(id, application).accepted
        ? { status: 'opened' }
        : failed('No compatible application could open this file.');
    },
  };
}
