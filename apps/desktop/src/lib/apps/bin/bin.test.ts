import { describe, expect, it, vi } from 'vite-plus/test';
import { binApp } from './bin.app';
import { appTestFixture } from '../testing/app-test-fixture';

const fixture = () => appTestFixture(binApp, {}, { x: 0, y: 0, w: 316, h: 174 });
describe('Recycle Bin activation', () => {
  it('requires a fresh double click for each restored file even when rows move up', () => {
    const c = fixture();
    const one = c.files.createText('one.txt').file!.id;
    const two = c.files.createText('two.txt').file!.id;
    c.files.remove(one);
    c.files.remove(two);
    c.clickAt(20, 40);
    expect(c.files.list('bin')).toHaveLength(2);
    c.clickAt(20, 40);
    expect(c.files.list('bin').map((file) => file.id)).toEqual([two]);
    c.clickAt(20, 40);
    expect(c.files.list('bin').map((file) => file.id)).toEqual([two]);
    c.clickAt(20, 40);
    expect(c.files.list('bin')).toHaveLength(0);
  });
  it('restores deleted folders together with their surviving contents', () => {
    const c = fixture();
    const created = c.files.createFolder('Archive');
    if (!created.ok) throw new Error(created.error);
    const folder = created.folder;
    const file = c.files.createText('note.txt', 'kept', folder.id).file!;
    c.files.removeFolder(folder.id);
    c.clickAt(20, 40);
    c.key('Enter');
    expect(c.files.getFolder(folder.id)).toMatchObject({ deleted: false });
    expect(c.files.get(file.id)?.deleted).toBe(false);
  });
  it('counts a deleted tree once and refuses a stale empty-bin confirmation', () => {
    const c = fixture();
    const folder = c.files.createFolder('Archive');
    if (!folder.ok) throw new Error(folder.error);
    const file = c.files.createText('inside.txt', 'kept', folder.folder.id).file!;
    c.files.removeFolder(folder.folder.id);
    c.command('empty');
    const spec = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    expect(spec.lines[0]).toBe('Permanently delete 1 item(s)?');
    const later = c.files.createText('later.txt').file!;
    c.files.remove(later.id);
    spec.onBtn?.(0, c.env);
    expect(c.files.get(file.id)?.deleted).toBe(true);
    expect(c.files.get(later.id)?.deleted).toBe(true);
    expect(c.session.status()).toContain('changed');
  });
});
