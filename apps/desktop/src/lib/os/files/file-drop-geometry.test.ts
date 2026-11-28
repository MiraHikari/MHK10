import { describe, expect, it } from 'vite-plus/test';
import { fileDropSite } from './file-drop-geometry';
import type { FileTransferSurface } from './file-transfer';

const desktop: FileTransferSurface = {
  bounds: { x: 0, y: 0, w: 640, h: 338 },
  target: {
    id: 'desktop',
    folder: 'desktop',
    volume: 'desktop',
    isTrash: false,
    acceptsDrop: true,
  },
  entries: [],
};
const folder = { ...desktop.target, id: 'folder', folder: 'folder' };
const explorer: FileTransferSurface = {
  bounds: { x: 100, y: 70, w: 300, h: 180 },
  target: { ...folder, id: 'root', folder: 'root' },
  entries: [
    {
      bounds: { x: 110, y: 90, w: 260, h: 20 },
      source: { id: 'folder', parent: 'root', kind: 'folder', volume: 'documents' },
      target: folder,
      icon: 'i_folder',
      label: 'Folder',
    },
  ],
};

describe('file drop geometry', () => {
  it('resolves row targets before the containing folder', () => {
    expect(
      fileDropSite([{ bounds: explorer.bounds, surface: explorer }], desktop, { x: 120, y: 95 })
        ?.target,
    ).toBe(folder);
    expect(
      fileDropSite([{ bounds: explorer.bounds, surface: explorer }], desktop, { x: 120, y: 140 })
        ?.target.folder,
    ).toBe('root');
  });
  it('does not drop through a covering window or outside the work area', () => {
    expect(
      fileDropSite(
        [{ bounds: explorer.bounds, surface: explorer }, { bounds: explorer.bounds }],
        desktop,
        { x: 120, y: 95 },
      ),
    ).toBeUndefined();
    expect(fileDropSite([], desktop, { x: 20, y: 345 })).toBeUndefined();
  });
  it('ignores the moving icon and targets the desktop underneath it', () => {
    expect(
      fileDropSite(
        [],
        { ...desktop, entries: explorer.entries },
        { x: 120, y: 95 },
        new Set(['folder']),
      )?.target.folder,
    ).toBe('desktop');
  });
});
