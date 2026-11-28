import type { FileSystem } from './filesystem';
import type { AppServices } from '../host/app-contracts';

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function downloadText(name: string, content: string): void {
  download(name, content, 'text/plain;charset=utf-8');
}

export async function downloadSandbox(
  files: FileSystem,
  backup?: AppServices['exportDocuments'],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!backup && [...files.list('documents'), ...files.list('bin')].some((file) => file.assetId))
      return { ok: false, error: 'Binary backup is unavailable in this host.' };
    const result = backup ? await backup() : { ok: true as const, content: files.exportData() };
    if (!result.ok) return result;
    download('mhk10-my-documents.json', result.content, 'application/json');
    return { ok: true };
  } catch {
    return { ok: false, error: 'The document backup could not be downloaded.' };
  }
}
