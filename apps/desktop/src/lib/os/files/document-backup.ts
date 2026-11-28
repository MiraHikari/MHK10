import { parseSavedFiles } from './filesystem-records';
import type { FileSystem } from './filesystem';
import { ASSET_FILE_LIMIT, ASSET_TOTAL_LIMIT, type BrowserAssetStore } from './browser-asset-store';

const FORMAT = 'mhk10-my-documents';
export const DOCUMENT_BACKUP_LIMIT = 190 * 1024 * 1024;
type Result = { ok: true } | { ok: false; error: string };
const failed = (error: string): Result => ({ ok: false, error });
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function backupDirectory(value: unknown) {
  if (!object(value) || !Array.isArray(value.files)) return null;
  // Session binaries are backed up too; restored copies become ordinary durable files.
  return parseSavedFiles({
    ...value,
    files: value.files.map((file: unknown) => {
      if (!object(file) || file.transient !== true) return file;
      const { transient: _transient, ...record } = file;
      return record;
    }),
  });
}

/** Backups include visitor files and copied publication displays; the readonly Library and credentials stay outside them. */
export function createDocumentBackup(
  files: FileSystem,
  assets: BrowserAssetStore,
  externalAsset?: (assetId: string) => Promise<Blob | undefined>,
) {
  let active = false;
  let disposed = false;
  return {
    dispose() {
      disposed = true;
    },
    async export(): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
      if (disposed) return { ok: false, error: 'The document service is closed.' };
      const snapshot = files.exportData();
      const data: unknown = JSON.parse(snapshot);
      const parsed = backupDirectory(data);
      if (!parsed) return { ok: false, error: 'The file directory could not be backed up.' };
      const records: { id: string; mime: string; data: string }[] = [];
      const ids = new Set(parsed.files.flatMap((file) => (file.assetId ? [file.assetId] : [])));
      let total = 0;
      for (const id of ids) {
        let blob: Blob | undefined;
        try {
          blob = (await assets.get(id)) ?? (await externalAsset?.(id));
        } catch {
          return { ok: false, error: 'A saved binary is unavailable. Backup was not created.' };
        }
        if (disposed) return { ok: false, error: 'The document service is closed.' };
        if (!blob)
          return { ok: false, error: 'A saved binary is unavailable. Backup was not created.' };
        if (blob.size > ASSET_FILE_LIMIT)
          return { ok: false, error: 'A saved binary is too large. Backup was not created.' };
        total += blob.size;
        if (total > ASSET_TOTAL_LIMIT) return { ok: false, error: 'The backup is too large.' };
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        records.push({ id, mime: blob.type, data: btoa(binary) });
      }
      if (disposed || files.exportData() !== snapshot)
        return { ok: false, error: 'Files changed during backup. Please try again.' };
      return {
        ok: true,
        content: JSON.stringify({ format: FORMAT, version: 1, directory: data, assets: records }),
      };
    },
    async import(source: string): Promise<Result> {
      if (disposed) return failed('The document service is closed.');
      if (active) return failed('Another document import is in progress.');
      if (source.length > DOCUMENT_BACKUP_LIMIT) return failed('The backup is too large.');
      let data: unknown;
      try {
        data = JSON.parse(source);
      } catch {
        return failed('This backup is not valid JSON.');
      }
      const directory =
        object(data) && data.format === FORMAT && data.version === 1 ? data.directory : data;
      const parsed = backupDirectory(directory);
      if (!parsed) return failed('This backup contains invalid files. Existing files were kept.');
      const binaryFiles = parsed.files.filter((file) => file.assetId);
      const inputs = object(data) && data.format === FORMAT ? data.assets : [];
      if (!Array.isArray(inputs) || inputs.length > 200) return failed('Invalid binary records.');
      const decoded = new Map<string, Blob>();
      let total = 0;
      try {
        for (const item of inputs) {
          if (
            !object(item) ||
            typeof item.id !== 'string' ||
            decoded.has(item.id) ||
            typeof item.mime !== 'string' ||
            typeof item.data !== 'string' ||
            item.data.length > Math.ceil(ASSET_FILE_LIMIT / 3) * 4 ||
            item.data.length % 4 !== 0 ||
            /[^A-Za-z0-9+/=]/.test(item.data) ||
            (item.data.includes('=') && !/^[^=]*={1,2}$/.test(item.data))
          )
            return failed('Invalid binary records.');
          const binary = atob(item.data);
          total += binary.length;
          if (total > ASSET_TOTAL_LIMIT || binary.length > ASSET_FILE_LIMIT)
            return failed('The backup is too large.');
          decoded.set(
            item.id,
            new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: item.mime }),
          );
        }
      } catch {
        return failed('The binary records could not be decoded.');
      }
      for (const file of binaryFiles) {
        const blob = decoded.get(file.assetId!);
        if (!blob || blob.size !== file.size || blob.type !== file.mime)
          return failed('This backup is missing binary contents. Existing files were kept.');
      }
      if (decoded.size !== new Set(binaryFiles.map((file) => file.assetId)).size)
        return failed('The backup contains unreferenced binary records.');
      const before = files.exportData();
      const created: string[] = [];
      const remapped = new Map<string, string>();
      active = true;
      try {
        for (const [oldId, blob] of decoded) {
          const id = `import:${crypto.randomUUID()}`;
          const result = await assets.put(id, blob);
          created.push(id);
          if (disposed) return failed('The document service is closed. Existing files were kept.');
          if (!result.ok || !result.persisted)
            return failed(
              result.ok ? 'Binary storage is unavailable. Existing files were kept.' : result.error,
            );
          remapped.set(oldId, id);
        }
        if (disposed || files.exportData() !== before)
          return failed('Files changed during import. Existing files were kept.');
        const result = files.importData({
          version: 1,
          ...parsed,
          files: parsed.files.map((file) =>
            file.assetId ? { ...file, assetId: remapped.get(file.assetId) } : file,
          ),
        });
        if (!result.ok) return failed(result.error ?? 'The backup could not be saved.');
        created.length = 0;
        return { ok: true };
      } catch {
        return failed('The backup could not be saved. Existing files were kept.');
      } finally {
        await Promise.allSettled(created.map((id) => assets.remove(id)));
        active = false;
      }
    },
  };
}
