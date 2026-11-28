import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createInputController, type InputController } from '../../ui/canvas/input';
import { createFileSystem, type FileSystem } from '../files/filesystem';
import type { FileTransferSurface, TransferSource } from '../files/file-transfer';
import {
  createDesktopFileDrag,
  type DesktopFileDrag,
  type TransferNotice,
} from './desktop-file-drag';

let input: InputController;
let files: FileSystem;
let drag: DesktopFileDrag;
let clicks = 0;
const notices: TransferNotice[] = [];
const source: TransferSource = {
  id: 'note',
  kind: 'file',
  volume: 'documents',
  parent: 'root',
};

function setup(suppliedFiles?: FileSystem) {
  clicks = 0;
  notices.length = 0;
  input = createInputController();
  files = suppliedFiles ?? createFileSystem(null);
  const created = files.createText('Note.txt', 'hello');
  if (!created.file) throw new Error('missing file');
  source.id = created.file.id;
  drag = createDesktopFileDrag({
    input,
    files,
    blocked: () => false,
    workspaceActive: () => false,
    windows: () => [{ id: 'computer', minimized: false, x: 0, y: 0, w: 200, h: 200 }],
    windowOpen: () => true,
    desktopSurface: () => ({
      bounds: { x: 0, y: 0, w: 640, h: 360 },
      target: {
        id: 'desktop',
        volume: 'desktop',
        folder: 'desktop',
        isTrash: false,
        acceptsDrop: true,
      },
      entries: [],
    }),
    syncIcons() {},
    playClick() {
      clicks += 1;
    },
    notify(notice) {
      notices.push(notice);
    },
    render() {},
  });
  const view: FileTransferSurface = {
    bounds: { x: 0, y: 0, w: 200, h: 200 },
    target: {
      id: 'computer',
      volume: 'documents',
      folder: 'root',
      isTrash: false,
      acceptsDrop: true,
    },
    entries: [
      {
        bounds: { x: 10, y: 10, w: 40, h: 40 },
        source,
        label: 'Note.txt',
        icon: 'i_doc',
      },
    ],
  };
  drag.publish('computer', view);
}

afterEach(() => {
  input?.dispose();
});

function frame(event: Parameters<InputController['queueInput']>[0], time: number) {
  input.queueInput(event);
  input.beginFrame(time);
}

describe('desktop file drag', () => {
  it('waits for accepted publication transfers while clear releases their former UI', async () => {
    const body = Promise.withResolvers<string>();
    const filesystem = createFileSystem(null, {
      library: {
        folders: [{ id: 'library:articles', name: 'Articles', readonly: true }],
        files: [
          {
            id: 'article',
            name: 'Article.md',
            content: '',
            folder: 'library:articles',
            source: 'personal',
            readonly: true,
            deleted: false,
          },
        ],
        readText: () => body.promise,
      },
    });
    setup(filesystem);
    const transfer = drag.transfer(
      [{ id: 'article', kind: 'readonly', volume: 'personal', parent: 'library:articles' }],
      { id: 'desktop', volume: 'desktop', folder: 'desktop', isTrash: false, acceptsDrop: true },
    );
    expect(drag.pending).toBe(true);
    const settled = drag.settled();
    drag.clear();
    expect(drag.pending).toBe(true);
    body.resolve('Complete accepted article.');
    await transfer;
    await settled;
    expect(drag.pending).toBe(false);
    expect(files.findByName('Article.md', 'desktop')?.content).toBe('Complete accepted article.');
    expect(notices).toEqual([]);
    expect(clicks).toBe(0);
  });
  it('moves a file after the pointer travels and leaves a short click alone', async () => {
    setup();
    frame({ px: 20, py: 20, down: true }, 1);
    drag.update();
    frame({ px: 22, py: 20, down: false }, 2);
    expect(drag.update()).toBe(false);
    expect(clicks).toBe(0);

    frame({ px: 20, py: 20, down: true }, 3);
    drag.update();
    frame({ px: 40, py: 40 }, 4);
    expect(drag.update()).toBe(true);
    frame({ px: 300, py: 300, down: false }, 5);
    expect(drag.update()).toBe(true);
    await expect.poll(() => clicks).toBe(1);
    expect(files.list('documents', 'desktop').map((file) => file.name)).toContain('Note.txt');
  });

  it('cancels on escape and requires a modifier before dropping onto the desktop itself', async () => {
    setup();
    frame({ px: 20, py: 20, down: true }, 1);
    drag.update();
    frame({ px: 40, py: 40, key: 'Escape' }, 2);
    expect(drag.update()).toBe(false);
    frame({ px: 300, py: 300, down: false }, 3);
    drag.update();
    expect(clicks).toBe(0);

    expect(drag.drop([source], { x: 300, y: 300 })).toBe(false);
    frame({ key: 'Control' }, 4);
    expect(drag.drop([source], { x: 300, y: 300 })).toBe(true);
    await expect.poll(() => clicks).toBe(1);
  });
});
