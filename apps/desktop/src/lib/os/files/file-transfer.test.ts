import { describe, it, expect } from 'vite-plus/test';

import {
  decideTransfer,
  modifierFromKeys,
  executeTransfer,
  type TransferSource,
  type TransferTarget,
} from './file-transfer';
import { createFileSystem } from './filesystem';
import { resolveFileOpen } from './file-types';

const source = (over: Partial<TransferSource> = {}): TransferSource => ({
  id: 'item',
  kind: 'file',
  volume: 'documents',
  parent: 'docs',
  ...over,
});

const target = (over: Partial<TransferTarget> = {}): TransferTarget => ({
  id: 'dest',
  volume: 'documents',
  folder: 'other',
  isTrash: false,
  acceptsDrop: true,
  ...over,
});

describe('executeTransfer', async () => {
  it('derives volumes from current ancestry so nested Desktop folders move within their volume', async () => {
    const fs = createFileSystem(null);
    const folder = fs.createFolder('Inbox', 'desktop');
    if (!folder.ok) throw new Error(folder.error);
    const file = fs.createText('note.txt', 'kept', folder.folder.id).file!;
    expect(
      await executeTransfer(
        fs,
        source({ id: file.id, volume: 'documents', parent: folder.folder.id }),
        target({ folder: 'desktop', volume: 'desktop' }),
        'none',
      ),
    ).toMatchObject({ ok: true, operation: 'move' });
    expect(fs.get(file.id)?.folder).toBe('desktop');
    expect(fs.list('documents', folder.folder.id)).toHaveLength(0);
    expect(
      await executeTransfer(
        fs,
        source({ id: file.id, volume: 'documents', parent: 'root' }),
        target({ folder: 'notes', volume: 'desktop' }),
        'none',
      ),
    ).toMatchObject({ ok: true, operation: 'copy' });
    expect(fs.get(file.id)?.folder).toBe('desktop');
    expect(fs.findByName('note.txt', 'notes')).toBeDefined();
  });
  it('preserves file and folder targets when sending shortcuts to Desktop', async () => {
    const fs = createFileSystem(null);
    const file = fs.createText('notes.txt', 'kept').file!;
    expect(
      await executeTransfer(
        fs,
        source({ id: file.id, parent: 'root' }),
        target({ folder: 'desktop', volume: 'desktop' }),
        'shortcut',
      ),
    ).toMatchObject({ ok: true, persisted: false });
    const link = fs.list('documents', 'desktop')[0];
    expect(link.target).toEqual({ appId: 'notepad', fileId: file.id });
    expect(resolveFileOpen(fs, link.id)).toEqual({
      kind: 'application',
      application: 'notepad',
      fileId: file.id,
    });
    expect(
      await executeTransfer(
        fs,
        source({ id: 'notes', kind: 'folder', parent: 'root' }),
        target({ folder: 'desktop', volume: 'desktop' }),
        'shortcut',
      ),
    ).toMatchObject({ ok: true });
    const folderLink = fs.list('documents', 'desktop')[1];
    expect(resolveFileOpen(fs, folderLink.id)).toEqual({ kind: 'folder', id: 'notes' });
  });

  it('revalidates stale geometry against deleted and read-only items', async () => {
    const fs = createFileSystem(null);
    const file = fs.createText('notes.txt').file!;
    fs.remove(file.id);
    expect(
      await executeTransfer(fs, source({ id: file.id }), target({ folder: 'desktop' }), 'copy'),
    ).toMatchObject({ ok: false });
    expect(
      await executeTransfer(
        fs,
        source({ id: 'personal:about', kind: 'file' }),
        target({ folder: 'desktop' }),
        'move',
      ),
    ).toMatchObject({ ok: false });
    expect(
      await executeTransfer(
        fs,
        source({ id: 'personal:about', kind: 'file' }),
        target({ folder: 'desktop' }),
        'copy',
      ),
    ).toMatchObject({ ok: true });
    expect(fs.list('personal')).toHaveLength(4);
  });

  it('rejects recursive moves without a filesystem mutation and does not overwrite shortcuts', async () => {
    const fs = createFileSystem(null);
    const parent = fs.createFolder('Project');
    if (!parent.ok) throw new Error(parent.error);
    const child = fs.createFolder('Child', parent.folder.id);
    if (!child.ok) throw new Error(child.error);
    const before = fs.exportData();
    expect(
      await executeTransfer(
        fs,
        source({ id: parent.folder.id, kind: 'folder' }),
        target({ folder: child.folder.id }),
        'move',
      ),
    ).toMatchObject({ ok: false });
    expect(fs.exportData()).toBe(before);
    for (let i = 0; i < 2; i++)
      expect(
        await executeTransfer(
          fs,
          source({ id: 'notepad', kind: 'app' }),
          target({ folder: 'desktop' }),
          'shortcut',
        ),
      ).toMatchObject({ ok: true });
    expect(fs.list('documents', 'desktop').map((file) => file.name)).toEqual([
      'notepad - Shortcut',
      'notepad - Shortcut (2)',
    ]);
  });
});

describe('decideTransfer', () => {
  it('moves within the same volume by default', () => {
    expect(decideTransfer(source(), target(), 'none').action).toEqual({ op: 'move' });
  });

  it('copies across volumes by default', () => {
    expect(decideTransfer(source(), target({ volume: 'personal' }), 'none').action).toEqual({
      op: 'copy',
    });
  });

  it('forces copy with Ctrl even on the same volume', () => {
    expect(decideTransfer(source(), target(), 'copy').action).toEqual({ op: 'copy' });
  });

  it('forces move with Shift across volumes', () => {
    expect(decideTransfer(source(), target({ volume: 'personal' }), 'move').action).toEqual({
      op: 'move',
    });
  });

  it('forces a shortcut with Alt', () => {
    expect(decideTransfer(source(), target(), 'shortcut').action).toEqual({ op: 'shortcut' });
  });

  it('defaults an app drag to a shortcut', () => {
    expect(decideTransfer(source({ kind: 'app' }), target(), 'none').action).toEqual({
      op: 'shortcut',
    });
  });

  it('deletes when dropped on the Recycle Bin', () => {
    const bin = target({ volume: 'bin', isTrash: true });
    expect(decideTransfer(source(), bin, 'none').action).toEqual({ op: 'delete' });
  });

  it('never deletes an application launcher', () => {
    const bin = target({ volume: 'bin', isTrash: true });
    const decision = decideTransfer(source({ kind: 'app' }), bin, 'none');
    expect(decision.action.op).toBe('none');
  });

  it('refuses to move or delete a read-only item but allows copy and shortcut', () => {
    const ro = source({ kind: 'readonly' });
    expect(decideTransfer(ro, target(), 'move').action.op).toBe('none');
    const bin = target({ volume: 'bin', isTrash: true });
    expect(decideTransfer(ro, bin, 'none').action.op).toBe('none');
    expect(decideTransfer(ro, target(), 'copy').action).toEqual({ op: 'copy' });
    expect(decideTransfer(ro, target(), 'shortcut').action).toEqual({ op: 'shortcut' });
  });

  it('reports none when dropped on its own folder', () => {
    const self = target({ folder: 'docs' });
    const decision = decideTransfer(source(), self, 'none');
    expect(decision.action).toEqual({ op: 'none', reason: 'item is already here' });
  });

  it('refuses a folder dropped into its own descendant', () => {
    const folder = source({ kind: 'folder' });
    const decision = decideTransfer(folder, target(), 'none', true);
    expect(decision.action.op).toBe('none');
  });

  it('reports none when the target refuses drops', () => {
    const decision = decideTransfer(source(), target({ acceptsDrop: false }), 'copy');
    expect(decision.action.op).toBe('none');
  });
});

describe('modifierFromKeys', () => {
  it('maps Ctrl to copy', () => {
    expect(modifierFromKeys({ ctrl: true, shift: false, alt: false })).toBe('copy');
  });

  it('maps Shift to move', () => {
    expect(modifierFromKeys({ ctrl: false, shift: true, alt: false })).toBe('move');
  });

  it('maps Alt to shortcut', () => {
    expect(modifierFromKeys({ ctrl: false, shift: false, alt: true })).toBe('shortcut');
  });

  it('maps Ctrl+Shift to shortcut', () => {
    expect(modifierFromKeys({ ctrl: true, shift: true, alt: false })).toBe('shortcut');
  });

  it('maps no keys to none', () => {
    expect(modifierFromKeys({ ctrl: false, shift: false, alt: false })).toBe('none');
  });
});
