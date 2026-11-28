import { describe, expect, it } from 'vite-plus/test';
import { ImageBrowser } from './image-browser-model';
import type { MediaRecord } from '../../../data/media';
const record = (id: string, title: string, folder: string, bytes?: number): MediaRecord => ({
  id,
  title,
  alt: title,
  preview: `/${id}.png`,
  display: `/${id}.jpg`,
  original: `/${id}.jpg`,
  date: `2026-0${id}-01`,
  folders: [folder],
  image: { width: 64, height: 48, bytes: 10, format: 'PNG' },
  file: bytes === undefined ? undefined : { width: 640, height: 480, bytes, format: 'JPEG' },
});
const photos = [
  record('1', 'A', '相册/风景', 300),
  record('2', 'B', '文章', 100),
  record('3', 'C', '相册/风景'),
];
describe('ImageBrowser', () => {
  it('ignores non-finite navigation and zoom values and inserts each local id once', () => {
    const browser = new ImageBrowser(photos, '1');
    browser.setZoom(2);
    for (const direction of [NaN, Infinity, -Infinity]) browser.move(direction);
    for (const zoom of [NaN, Infinity, -Infinity]) browser.setZoom(zoom);
    expect(browser.snapshot()).toMatchObject({ selected: { id: '1' }, zoom: 2 });
    browser.move(1.9);
    expect(browser.snapshot().selected?.id).toBe('2');
    const local = { ...record('local', 'Local', 'Local files', 99), local: true };
    browser.add([local, { ...local, title: 'Duplicate' }]);
    expect(browser.snapshot().items.map((item) => item.title)).toEqual(['Local']);
    for (const key of ['__proto__', 'constructor', 'toString'])
      expect(browser.keyIntent(key)).toBeUndefined();
  });
  it('owns imported records and exposes immutable snapshots across sessions', () => {
    const source = record('1', 'Original', 'Pictures', 300);
    const first = new ImageBrowser([source]);
    const second = new ImageBrowser([source]);
    source.title = 'Changed by caller';
    source.folders.push('Other');
    source.image.width = 100;
    source.file!.bytes = 1;
    const view = first.snapshot();
    expect(view.selected).toMatchObject({
      title: 'Original',
      folders: ['Pictures'],
      image: { width: 64 },
      file: { bytes: 300 },
    });
    expect(() => Reflect.set(view.selected!, 'title', 'Changed through snapshot')).not.toThrow();
    expect(Reflect.set(view.selected!.folders, 0, 'Changed')).toBe(false);
    expect(Reflect.set(view.selected!.image, 'width', 1)).toBe(false);
    expect(Reflect.set(view.selected!.file!, 'bytes', 1)).toBe(false);
    expect(Object.isFrozen(view.items)).toBe(true);
    expect(second.snapshot()).toEqual(view);

    const local = record('2', 'Local', 'Local files', 99);
    first.add([local]);
    local.folders.length = 0;
    local.original = '/replaced.png';
    expect(first.snapshot().selected).toMatchObject({
      id: '2',
      original: '/2.jpg',
      folders: ['Local files'],
    });
    expect(second.snapshot().selected?.id).toBe('1');
  });
  it('keeps sorting, folder filtering and selection in the same observable interface', () => {
    const browser = new ImageBrowser(photos, '2');
    expect(browser.snapshot().selected?.id).toBe('2');
    browser.order('size', true);
    expect(browser.snapshot().items.map((item) => item.id)).toEqual(['1', '2', '3']);
    browser.filter('相册');
    expect(browser.snapshot().items.map((item) => item.id)).toEqual(['1', '3']);
    expect(browser.snapshot().selected?.id).toBe('1');
    expect(browser.select('2')).toBe(false);
    browser.filter('相册', 'missing');
    expect(browser.snapshot().selected).toBeUndefined();
    browser.move(1);
    expect(browser.snapshot().items).toEqual([]);
  });
  it('wraps image navigation and resets view transforms for a different image', () => {
    const browser = new ImageBrowser(photos, '1');
    browser.rotate(-1);
    browser.flip('x');
    browser.setZoom(2);
    expect(browser.snapshot()).toMatchObject({ rotation: 270, flipX: true, zoom: 2 });
    browser.move(-1);
    expect(browser.snapshot()).toMatchObject({
      selected: { id: '3' },
      rotation: 0,
      flipX: false,
      zoom: 'fit',
    });
    browser.move(1);
    expect(browser.snapshot().selected?.id).toBe('1');
    expect(photos[0].image.width).toBe(64);
  });
  it('clamps zoom and adopts local files without changing the shared catalog', () => {
    const browser = new ImageBrowser(photos);
    browser.setZoom(100);
    expect(browser.snapshot().zoom).toBe(8);
    browser.setZoom(0);
    expect(browser.snapshot().zoom).toBe(0.125);
    browser.add([{ ...record('4', 'Local', 'Local files', 99), local: true }]);
    expect(browser.snapshot()).toMatchObject({
      folder: 'Local files',
      selected: { id: '4', local: true },
    });
    expect(photos).toHaveLength(3);
  });

  it('keeps colour adjustments local and compares without changing a copy request', () => {
    const browser = new ImageBrowser(photos, '1');
    browser.adjust({ brightness: 25, contrast: 120, saturation: 50 });
    browser.rotate();
    browser.flip('x');
    const request = browser.copyRequest();
    if (!request) throw new Error('Expected a selected image.');
    browser.compare(true);
    browser.setZoom(2);
    expect(browser.isCurrentCopy(request)).toBe(true);
    expect(browser.snapshot()).toMatchObject({
      comparing: true,
      adjustments: { brightness: 25, contrast: 120, saturation: 50 },
    });
    expect(request.edit).toEqual({
      rotation: 90,
      flipX: true,
      flipY: false,
      adjustments: { brightness: 25, contrast: 120, saturation: 50 },
    });
    browser.resetAdjustments();
    expect(browser.isCurrentCopy(request)).toBe(false);
    expect(browser.snapshot()).toMatchObject({
      rotation: 90,
      flipX: true,
      comparing: false,
      adjustments: { brightness: 0, contrast: 100, saturation: 100 },
    });
    expect(photos[0].original).toBe('/1.jpg');
  });

  it('invalidates pending copies on every image edit and image replacement, even after returning', () => {
    const browser = new ImageBrowser(photos, '1');
    const request = browser.copyRequest();
    if (!request) throw new Error('Expected a selected image.');
    browser.select('2');
    browser.select('1');
    expect(browser.isCurrentCopy(request)).toBe(false);
    for (const change of [
      () => browser.rotate(),
      () => browser.flip('y'),
      () => browser.preset('vivid'),
      () => browser.preset('grayscale'),
      () => browser.resetView(),
    ]) {
      const copy = browser.copyRequest();
      if (!copy) throw new Error('Expected a selected image.');
      change();
      expect(browser.isCurrentCopy(copy)).toBe(false);
    }
    browser.filter('', 'missing');
    expect(browser.copyRequest()).toBeUndefined();
    browser.filter('', '');
    expect(browser.snapshot()).toMatchObject({
      comparing: false,
      adjustments: { brightness: 0, contrast: 100, saturation: 100 },
    });
  });

  it('maps tested keyboard keys onto stable commands', () => {
    const browser = new ImageBrowser(photos, '1');
    const listed = (command: string) => ({
      command,
      dismissMenus: true,
      refocus: 'browsing-list' as const,
    });
    expect(browser.keyIntent('ArrowLeft')).toEqual(listed('previous'));
    expect(browser.keyIntent('ArrowUp')).toEqual(listed('previous'));
    expect(browser.keyIntent('ArrowRight')).toEqual(listed('next'));
    expect(browser.keyIntent('ArrowDown')).toEqual(listed('next'));
    expect(browser.keyIntent('Enter')).toEqual(listed('browse'));
    expect(browser.keyIntent('+')).toEqual(listed('zoom-in'));
    expect(browser.keyIntent('=')).toEqual(listed('zoom-in'));
    expect(browser.keyIntent('-')).toEqual(listed('zoom-out'));
    expect(browser.keyIntent('0')).toEqual(listed('fit'));
    expect(browser.keyIntent('1')).toEqual(listed('actual'));
    expect(browser.keyIntent('F1')).toEqual(listed('help'));
    expect(browser.keyIntent('Escape')).toEqual({
      command: 'escape',
      dismissMenus: false,
      refocus: 'none',
    });
    expect(browser.keyIntent('Home')).toEqual({
      command: 'home',
      dismissMenus: false,
      refocus: 'list',
    });
    expect(browser.keyIntent('End')).toEqual({
      command: 'end',
      dismissMenus: false,
      refocus: 'list',
    });
    expect(browser.keyIntent('a')).toBeUndefined();
    expect(browser.keyIntent('f1')).toBeUndefined();
  });

  it('keeps a slideshow across timer steps and stops it for commands', () => {
    const browser = new ImageBrowser(photos, '1');
    const available = { reducedMotion: false, exportBusy: false };
    expect(browser.commandDisabled('slideshow', { ...available, reducedMotion: true })).toBe(true);
    expect(browser.commandDisabled('slideshow', available)).toBe(false);
    expect(browser.perform('slideshow', { reducedMotion: true })).toEqual([]);
    expect(browser.snapshot().slideshow).toBe(false);
    expect(browser.perform('slideshow', { reducedMotion: false })).toEqual([
      { type: 'slideshow', running: true },
    ]);
    browser.rotate();
    browser.move(1);
    expect(browser.snapshot()).toMatchObject({
      selected: { id: '2' },
      rotation: 0,
      slideshow: true,
    });
    expect(browser.perform('help')).toEqual([
      { type: 'slideshow', running: false },
      { type: 'dialog', name: 'help', open: true },
    ]);
    expect(browser.perform('slideshow', { reducedMotion: false })).toEqual([
      { type: 'slideshow', running: true },
    ]);
    expect(browser.perform('slideshow', { reducedMotion: true })).toEqual([
      { type: 'slideshow', running: false },
    ]);
    expect(browser.perform('slideshow', { reducedMotion: false })).toEqual([
      { type: 'slideshow', running: true },
    ]);
    expect(browser.perform('next')).toEqual([
      { type: 'slideshow', running: false },
      { type: 'render', rebuild: false },
    ]);
    expect(browser.snapshot()).toMatchObject({ selected: { id: '3' }, slideshow: false });
    expect(browser.haltSlideshow()).toEqual([]);
    expect(browser.perform('escape')).toEqual([{ type: 'mode', mode: 'browse' }]);

    const only = new ImageBrowser([photos[0]]);
    expect(only.perform('slideshow', { reducedMotion: false })).toEqual([]);
    expect(only.commandDisabled('slideshow', available)).toBe(true);
    expect(new ImageBrowser([]).perform('slideshow', { reducedMotion: false })).toEqual([]);
  });

  it('expresses selection, navigation and command availability as intents', () => {
    const browser = new ImageBrowser(photos, '1');
    browser.setZoom(3);
    browser.perform('slideshow', { reducedMotion: false });
    expect(browser.perform('home')).toEqual([
      { type: 'slideshow', running: false },
      { type: 'render', rebuild: false },
    ]);
    expect(browser.snapshot()).toMatchObject({ selected: { id: '1' }, zoom: 3, slideshow: false });
    browser.perform('slideshow', { reducedMotion: false });
    expect(browser.perform('end')).toEqual([
      { type: 'slideshow', running: false },
      { type: 'render', rebuild: false },
    ]);
    expect(browser.snapshot()).toMatchObject({
      selected: { id: '3' },
      zoom: 'fit',
      slideshow: false,
    });
    browser.perform('slideshow', { reducedMotion: false });
    expect(browser.choose('1')).toEqual([
      { type: 'slideshow', running: false },
      { type: 'render', rebuild: false },
    ]);
    expect(browser.snapshot().selected?.id).toBe('1');
    browser.perform('slideshow', { reducedMotion: false });
    expect(browser.filterTo('文章', '  B ')).toEqual([
      { type: 'slideshow', running: false },
      { type: 'render', rebuild: true },
    ]);
    expect(browser.snapshot()).toMatchObject({
      folder: '文章',
      query: 'b',
      selected: { id: '2' },
      slideshow: false,
    });
    expect(browser.perform('clear-search')).toEqual([
      { type: 'render', rebuild: true },
      { type: 'search', value: '', focus: true },
    ]);
    expect(browser.snapshot()).toMatchObject({ folder: '文章', query: '', selected: { id: '2' } });
    expect(browser.perform('reverse')).toEqual([{ type: 'render', rebuild: true }]);
    expect(browser.snapshot().descending).toBe(true);
    expect(browser.perform('compare')).toEqual([{ type: 'render', rebuild: false }]);
    expect(browser.snapshot().comparing).toBe(true);
    browser.setZoom('fit');
    expect(browser.perform('zoom-in', { zoom: 0.5 })).toEqual([{ type: 'render', rebuild: false }]);
    expect(browser.snapshot().zoom).toBe(1);
    expect(browser.perform('zoom-out', { zoom: 0.2 })).toEqual([
      { type: 'render', rebuild: false },
    ]);
    expect(browser.snapshot().zoom).toBe(0.125);
    browser.perform('actual');
    expect(browser.snapshot().zoom).toBe(1);
    browser.perform('fit');
    expect(browser.snapshot().zoom).toBe('fit');
    expect(browser.perform('previous')).toEqual([{ type: 'render', rebuild: false }]);
    expect(browser.snapshot().selected?.id).toBe('2');
    expect(browser.perform('browse')).toEqual([{ type: 'mode', mode: 'toggle' }]);
    expect(browser.perform('open')).toEqual([{ type: 'open-files' }]);
    expect(browser.perform('print')).toEqual([{ type: 'print' }]);
    expect(browser.perform('export-copy')).toEqual([{ type: 'export' }]);
    expect(browser.perform('cancel-export')).toEqual([
      { type: 'cancel-export', message: 'Export cancelled.' },
      { type: 'render', rebuild: false },
    ]);
    expect(browser.perform('pixel')).toEqual([
      { type: 'pixel' },
      { type: 'render', rebuild: false },
    ]);
    expect(browser.perform('properties')).toEqual([
      { type: 'dialog', name: 'properties', open: true },
    ]);
    expect(browser.perform('close-properties')).toEqual([
      { type: 'dialog', name: 'properties', open: false },
    ]);
    expect(browser.perform('adjustments')).toEqual([
      { type: 'dialog', name: 'adjustments', open: true },
    ]);
    expect(browser.perform('close-adjustments')).toEqual([
      { type: 'dialog', name: 'adjustments', open: false },
    ]);
    expect(browser.perform('close-help')).toEqual([{ type: 'dialog', name: 'help', open: false }]);
    expect(browser.perform('missing')).toEqual([{ type: 'render', rebuild: false }]);
    expect(browser.perform('preset-grayscale')).toEqual([{ type: 'render', rebuild: false }]);
    expect(browser.snapshot().adjustments.saturation).toBe(0);
    expect(browser.perform('rotate-right')).toEqual([{ type: 'render', rebuild: false }]);
    expect(browser.snapshot().rotation).toBe(90);

    const available = { reducedMotion: false, exportBusy: false };
    const empty = new ImageBrowser([]);
    expect(empty.perform('properties')).toEqual([]);
    expect(empty.perform('adjustments')).toEqual([
      { type: 'dialog', name: 'adjustments', open: true },
    ]);
    expect(empty.perform('home')).toEqual([{ type: 'render', rebuild: false }]);
    expect(empty.commandDisabled('adjustments', available)).toBe(true);
    expect(empty.commandDisabled('properties', available)).toBe(true);
    expect(empty.commandDisabled('print', available)).toBe(true);
    expect(empty.commandDisabled('previous', available)).toBe(true);
    expect(empty.commandDisabled('help', available)).toBe(false);
    expect(empty.commandDisabled('open', available)).toBe(false);
    expect(empty.commandDisabled('reverse', available)).toBe(false);
    expect(empty.commandDisabled('browse', available)).toBe(false);
    expect(empty.commandDisabled('pixel', available)).toBe(false);
    expect(empty.commandDisabled('export-copy', available)).toBe(true);
    expect(empty.commandDisabled('export-copy', { ...available, exportBusy: true })).toBe(true);
    expect(empty.commandDisabled('cancel-export', available)).toBe(true);
    expect(empty.commandDisabled('cancel-export', { ...available, exportBusy: true })).toBe(false);
    expect(empty.commandDisabled('slideshow', available)).toBe(true);
    const ready = new ImageBrowser(photos, '2');
    expect(ready.commandDisabled('export-copy', available)).toBe(false);
    expect(ready.commandDisabled('rotate-right', available)).toBe(false);
    expect(ready.perform('previous')).toEqual([{ type: 'render', rebuild: false }]);
    expect(ready.snapshot().selected?.id).toBe('1');
  });
});
