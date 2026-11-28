import { describe, expect, it } from 'vite-plus/test';
import { createFileSystem, FILES_KEY, type FileStorage } from './filesystem';

const desktopShortcuts = [
  { appId: 'computer', name: 'My Computer' },
  { appId: 'notepad', name: 'Notepad' },
] as const;
function storage(initial?: string): FileStorage {
  const values = new Map<string, string>(initial ? [[FILES_KEY, initial]] : []);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe('desktop shortcut files', () => {
  it('materializes catalog defaults once with stable mutable filesystem identities', () => {
    const saved = storage();
    const fs = createFileSystem(saved, { desktopShortcuts });
    expect(fs.notice).toBe('');
    expect(
      fs.list('documents', 'desktop').map((file) => [file.id, file.name, file.target?.appId]),
    ).toEqual([
      ['desktop:app:computer', 'My Computer', 'computer'],
      ['desktop:app:notepad', 'Notepad', 'notepad'],
    ]);
    fs.rename('desktop:app:computer', 'Explorer');
    fs.remove('desktop:app:notepad');
    const reloaded = createFileSystem(saved, { desktopShortcuts });
    expect(reloaded.list('documents', 'desktop').map((file) => file.name)).toEqual(['Explorer']);
    expect(reloaded.get('desktop:app:notepad')?.deleted).toBe(true);
    reloaded.emptyBin();
    expect(
      createFileSystem(saved, { desktopShortcuts }).get('desktop:app:notepad'),
    ).toBeUndefined();
    expect(JSON.parse(saved.getItem(FILES_KEY)!).desktopInitialized).toBe(true);
  });

  it('migrates an old snapshot without replacing names, files, or already deleted desktop shortcuts', () => {
    const saved = storage();
    const legacy = createFileSystem(saved);
    legacy.createText('My Computer', 'visitor content', 'desktop');
    const existing = legacy.createShortcut('Custom Notepad', { appId: 'notepad' }, 'desktop').file!;
    legacy.remove(existing.id);
    const fs = createFileSystem(saved, { desktopShortcuts });
    expect(fs.get('desktop:app:computer')?.name).toBe('My Computer (2)');
    expect(fs.findByName('My Computer', 'desktop')?.content).toBe('visitor content');
    expect(fs.get('desktop:app:notepad')).toBeUndefined();
    expect(fs.get(existing.id)?.deleted).toBe(true);
    expect(fs.restore(existing.id).ok).toBe(true);
    expect(fs.list('documents', 'desktop')).toHaveLength(3);
  });

  it('retains the entire visitor volume at capacity while reserving a bounded default allowance', () => {
    const saved = storage();
    const legacy = createFileSystem(saved);
    for (let i = 0; i < 199; i++) expect(legacy.createText(`note-${i}.txt`).ok).toBe(true);
    const migrated = createFileSystem(saved, { desktopShortcuts });
    expect(migrated.list('documents')).toHaveLength(200);
    expect(migrated.list('documents', 'desktop')).toHaveLength(2);
    expect(migrated.createText('one-too-many.txt').ok).toBe(false);
    const reloaded = createFileSystem(saved, { desktopShortcuts });
    expect(reloaded.list('documents')).toHaveLength(200);
    expect(reloaded.list('documents', 'desktop')).toHaveLength(2);
    expect(reloaded.notice).not.toContain('damaged');
  });

  it('keeps corrupt snapshots recoverable and rebuilds defaults only on an explicit reset', () => {
    const saved = storage('{broken');
    const fs = createFileSystem(saved, { desktopShortcuts });
    expect(saved.getItem(FILES_KEY)).toBe('{broken');
    expect(fs.list('documents', 'desktop')).toHaveLength(2);
    expect(fs.persisted).toBe(false);
    expect(JSON.parse(fs.exportData()).recoveryRaw).toBe('{broken');
    fs.remove('desktop:app:computer');
    expect(fs.reset().persisted).toBe(true);
    expect(fs.list('documents', 'desktop')).toHaveLength(2);
    expect(createFileSystem(saved, { desktopShortcuts }).get('desktop:app:computer')?.deleted).toBe(
      false,
    );
  });

  it('does not silently accept a malformed initialization marker', () => {
    const saved = storage(JSON.stringify({ version: 1, files: [], desktopInitialized: 'true' }));
    const fs = createFileSystem(saved, { desktopShortcuts });
    expect(fs.notice).toContain('damaged');
    expect(fs.persisted).toBe(false);
  });
});
