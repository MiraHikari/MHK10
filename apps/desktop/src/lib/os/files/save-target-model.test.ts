import { describe, expect, it } from 'vite-plus/test';
import { createFileSystem } from './filesystem';
import { defaultSaveFolder, isWritableSaveFolder, writableSaveFolders } from './save-target-model';

describe('Save As destinations', () => {
  it('excludes the publication Library and falls back from readonly destinations', () => {
    const files = createFileSystem(null, {
      library: {
        folders: [{ id: 'library:root', name: 'Library', parent: 'root', readonly: true }],
        files: [],
      },
    });
    const folders = files.folders();
    expect(
      writableSaveFolders(folders).every((folder) => !folder.readonly && !folder.deleted),
    ).toBe(true);
    expect(isWritableSaveFolder(folders, 'library:root')).toBe(false);
    expect(defaultSaveFolder(folders, 'library:root')).toBe('root');
    expect(defaultSaveFolder(folders, 'chat')).toBe('chat');
  });
});
