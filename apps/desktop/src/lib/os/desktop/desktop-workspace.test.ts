import { describe, expect, it, vi } from 'vite-plus/test';
import { createFileSystem } from '../files/filesystem';
import { desktopIconGrid } from './desktop-icon-layout';
import {
  createDesktopWorkspace,
  DESKTOP_ICONS_KEY,
  type WorkspacePreferences,
} from './desktop-workspace';

function fixture(
  options: { stored?: unknown; width?: number; height?: number; count?: number } = {},
) {
  const values = new Map<string, string>();
  if (options.stored !== undefined) values.set(DESKTOP_ICONS_KEY, JSON.stringify(options.stored));
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const preferences: WorkspacePreferences = {
    showAssistant: false,
    showDesktopIcons: true,
    showFileExtensions: true,
    autoArrangeIcons: false,
  };
  const files = createFileSystem(null, {
    desktopShortcuts: [
      { appId: 'computer', name: 'Computer' },
      { appId: 'calculator', name: 'Calculator' },
      { appId: 'notepad', name: 'Notepad' },
    ],
  });
  for (let index = 3; index < (options.count ?? 3); index++)
    files.createText(`Note ${index}.txt`, 'contents', 'desktop');
  const workArea = { x: 0, y: 0, w: options.width ?? 640, h: options.height ?? 338 };
  const workspace = createDesktopWorkspace({
    files,
    storage,
    settings: () => preferences,
    workArea,
  });
  return { workspace, files, storage, preferences, values, workArea };
}

describe('desktop workspace ownership', () => {
  it('describes a shortcut, a folder and a missing icon', () => {
    const { workspace, files } = fixture();
    const shortcut = workspace.entries.find((entry) => entry.targetId === 'desktop:app:computer');
    expect(shortcut).toBeTruthy();
    if (!shortcut) return;
    expect(workspace.properties(shortcut.id)).toEqual([
      'Name: Computer',
      'Location: Desktop',
      'Type: Shortcut',
      'Target: My Computer',
      'Source: visitor',
    ]);
    const folder = files.createFolder('Pack', 'desktop');
    expect(folder.ok).toBe(true);
    if (!folder.ok) return;
    workspace.sync({ force: true });
    const icon = workspace.entries.find((entry) => entry.targetId === folder.folder.id);
    expect(icon && workspace.properties(icon.id)).toEqual([
      'Name: Pack',
      'Location: Desktop',
      'Type: File folder',
      'Contains: 0 object(s)',
      'Source: This computer',
    ]);
    expect(workspace.properties('missing')).toBeUndefined();
  });

  it('publishes copied geometry and selection while retaining stable file identities', () => {
    const { workspace } = fixture();
    const first = workspace.items[0];
    expect(workspace.entry(first.id)).toMatchObject({
      kind: 'file',
      label: 'Computer',
      targetId: 'desktop:app:computer',
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(workspace.entry(first.id))).toBe(true);
    expect(Reflect.set(first, 'x', 999)).toBe(false);
    workspace.select(first.id);
    const selected = workspace.selected;
    expect([...selected]).toEqual([first.id]);
    workspace.clear();
    expect([...selected]).toEqual([first.id]);
    expect([...workspace.selected]).toEqual([]);
    expect(workspace.launchBounds(first.id)).toEqual({ x: first.x + 18, y: first.y, w: 32, h: 32 });
    const surface = workspace.fileSurface();
    surface.entries[0].bounds.x = 900;
    expect(workspace.items[0].x).toBe(first.x);
  });

  it('reconciles files and preference changes without reloading unchanged desktops', () => {
    const { workspace, files, preferences } = fixture();
    workspace.select(workspace.items[0].id);
    expect(workspace.sync()).toBe(false);
    const note = files.createText('note.txt', 'text', 'desktop').file!;
    expect(workspace.sync()).toBe(true);
    expect(workspace.entry(`desktop-file:${note.id}`)?.label).toBe('note.txt');
    expect(workspace.selected.size).toBe(1);
    preferences.showFileExtensions = false;
    expect(workspace.sync()).toBe(true);
    expect(workspace.entry(`desktop-file:${note.id}`)?.label).toBe('note');
    preferences.showDesktopIcons = false;
    workspace.sync();
    expect(workspace.selected.size).toBe(0);
    expect(workspace.launchBounds(workspace.items[0].id)).toBeUndefined();
    expect(workspace.begin({ x: 10, y: 10 })).toBe(false);
  });

  it('persists a real icon movement and retains it after a failed storage write', () => {
    const { workspace, storage, workArea } = fixture();
    const first = workspace.items[0];
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    workspace.begin({ x: first.x + 5, y: first.y + 5 });
    workspace.update({ x: first.x + 25, y: first.y + 15 });
    expect(workspace.finish({ x: first.x + 25, y: first.y + 15 })).toEqual({
      activate: undefined,
      dragged: true,
    });
    expect(workspace.items[0]).toMatchObject({ x: first.x + 20, y: first.y + 10 });
    workspace.sync({ force: true, workArea });
    expect(workspace.items[0]).toMatchObject({ x: first.x + 20, y: first.y + 10 });
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toMatchObject({
      version: 1,
      arrangement: 'manual',
      positions: [{ id: first.id, x: first.x + 20, y: first.y + 10 }],
    });
  });

  it('keeps marquee selection and cancelled dragging out of the saved layout', () => {
    const { workspace, storage } = fixture();
    const original = workspace.items;
    workspace.begin({ x: 200, y: 250 });
    workspace.update({ x: 0, y: 0 });
    workspace.finish({ x: 0, y: 0 });
    expect(workspace.selected.size).toBe(3);
    expect(workspace.items).toEqual(original);
    workspace.begin({ x: 10, y: 10 });
    workspace.update({ x: 160, y: 60 });
    workspace.cancel();
    expect(workspace.items).toEqual(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('restores drag geometry before a file transfer and leaves positions unpersisted', () => {
    const { workspace, storage } = fixture();
    const original = workspace.items;
    workspace.begin({ x: 10, y: 10 });
    workspace.update({ x: 110, y: 60 });
    const transfer = vi.fn((sources) => {
      expect(workspace.items).toEqual(original);
      expect(sources).toMatchObject([{ id: 'desktop:app:computer', volume: 'desktop' }]);
      return true;
    });
    workspace.finish({ x: 110, y: 60 }, false, undefined, transfer);
    expect(transfer).toHaveBeenCalledOnce();
    expect(workspace.items).toEqual(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('paginates and reflows through the same geometry used by selection and launch anchors', () => {
    const { workspace, preferences, storage } = fixture({ width: 280, height: 200, count: 25 });
    expect(workspace.pageCount).toBeGreaterThan(1);
    const firstPage = workspace.items;
    workspace.select(firstPage[0].id);
    workspace.changePage(1);
    expect(workspace.page).toBe(1);
    expect(workspace.selected.size).toBe(0);
    expect(workspace.launchBounds(firstPage[0].id)).toBeUndefined();
    expect(workspace.items.every((item) => !firstPage.some((prior) => prior.id === item.id))).toBe(
      true,
    );
    preferences.showAssistant = true;
    workspace.sync({ workArea: { x: 0, y: 0, w: 960, h: 516 } });
    expect(workspace.page).toBe(0);
    expect(workspace.pageCount).toBe(1);
    expect(workspace.items).toHaveLength(25);
    expect(
      workspace.items.every(
        (item) => Number.isInteger(item.x) && item.x + item.w <= 960 && item.y + item.h <= 516,
      ),
    ).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('cancels an active preview when dimensions change and preserves selection', () => {
    const { workspace, storage } = fixture();
    const first = workspace.items[0];
    workspace.select(first.id);
    workspace.begin({ x: 10, y: 10 });
    workspace.update({ x: 120, y: 60 });
    workspace.sync({ workArea: { x: 0, y: 0, w: 960, h: 516 } });
    expect(workspace.active).toBe(false);
    expect(workspace.items[0]).toEqual(first);
    expect([...workspace.selected]).toEqual([first.id]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('recovers a complete legacy grid as adaptive and retains sparse manual records', () => {
    const ids = ['computer', 'calculator', 'notepad'];
    const legacy = desktopIconGrid(ids, 640, 338);
    const automatic = fixture({ stored: { version: 1, positions: legacy } });
    automatic.workspace.sync({ workArea: { x: 0, y: 0, w: 280, h: 138 } });
    expect(automatic.workspace.items[2].x).toBe(92);
    const manual = fixture({
      stored: { version: 1, positions: [{ id: 'computer', x: 190, y: 80 }] },
    });
    expect(manual.workspace.items[0]).toMatchObject({ x: 190, y: 80 });
    expect(manual.storage.setItem).not.toHaveBeenCalled();
  });

  it('stores name arrangement without converting automatic drag release to manual positions', () => {
    const { workspace, preferences, storage } = fixture();
    preferences.autoArrangeIcons = true;
    workspace.sync();
    expect(workspace.entry(workspace.items[0].id)?.label).toBe('Calculator');
    workspace.begin({ x: 10, y: 10 });
    workspace.update({ x: 120, y: 50 });
    workspace.finish({ x: 120, y: 50 });
    expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
      version: 1,
      arrangement: 'name',
      positions: [],
    });
    expect(workspace.items[0]).toMatchObject({ x: 2, y: 6 });
  });

  it('keeps separate workspaces usable after disposal and rejects new gestures on the old owner', () => {
    const first = fixture();
    const second = fixture({ width: 280, height: 138 });
    first.workspace.selectAll();
    expect(second.workspace.selected.size).toBe(0);
    first.workspace.dispose();
    first.workspace.dispose();
    expect(first.workspace.items).toEqual([]);
    expect(first.workspace.entries).toEqual([]);
    expect(first.workspace.begin({ x: 10, y: 10 })).toBe(false);
    second.workspace.selectAll();
    expect(second.workspace.selected.size).toBe(3);
    expect(second.workspace.arrange(true)).toBe(true);
    expect(second.storage.setItem).toHaveBeenCalledOnce();
  });
});
