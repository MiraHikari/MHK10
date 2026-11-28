import type { MediaRecord } from '../../../data/media';
import { imageProcessingSource } from './image-source-model';
import {
  DEFAULT_IMAGE_ADJUSTMENTS,
  normalizeImageAdjustments,
  type ImageAdjustments,
  type ImageEdit,
} from './image-processing-model';

export type ImageSort = 'name' | 'date' | 'size';
export type ImageView = 'thumbnails' | 'details' | 'list';
export type ImageRecord = Readonly<Omit<MediaRecord, 'folders' | 'image' | 'file'>> & {
  readonly folders: readonly string[];
  readonly image: Readonly<MediaRecord['image']>;
  readonly file?: Readonly<NonNullable<MediaRecord['file']>>;
};

function ownRecord(record: MediaRecord): ImageRecord {
  return Object.freeze({
    ...record,
    folders: Object.freeze([...record.folders]),
    image: Object.freeze({ ...record.image }),
    ...(record.file ? { file: Object.freeze({ ...record.file }) } : {}),
  });
}

export interface ImageBrowserSnapshot {
  items: readonly ImageRecord[];
  selected: ImageRecord | undefined;
  folder: string;
  query: string;
  sort: ImageSort;
  descending: boolean;
  view: ImageView;
  zoom: number | 'fit';
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  adjustments: Readonly<ImageAdjustments>;
  comparing: boolean;
  slideshow: boolean;
}
export type ImageBrowserIntent =
  | { type: 'render'; rebuild: boolean }
  | { type: 'slideshow'; running: boolean }
  | { type: 'open-files' }
  | { type: 'dialog'; name: 'adjustments' | 'properties' | 'help'; open: boolean }
  | { type: 'export' }
  | { type: 'cancel-export'; message: string }
  | { type: 'mode'; mode: 'browse' | 'toggle' }
  | { type: 'search'; value: string; focus: boolean }
  | { type: 'print' }
  | { type: 'pixel' };
export interface ImageKeyIntent {
  command: string;
  dismissMenus: boolean;
  refocus: 'none' | 'list' | 'browsing-list';
}
export interface ImageCommandContext {
  zoom?: number;
  reducedMotion?: boolean;
}
export interface ImageCommandAvailability {
  reducedMotion: boolean;
  exportBusy: boolean;
}
export type ImagePreset = 'vivid' | 'grayscale';
export interface ImageCopyRequest {
  id: string;
  source: string;
  title: string;
  revision: number;
  edit: ImageEdit;
}

const SELECTION_COMMANDS = new Set([
  'previous',
  'next',
  'fit',
  'actual',
  'zoom-in',
  'zoom-out',
  'rotate-left',
  'rotate-right',
  'flip-x',
  'flip-y',
  'reset',
  'properties',
  'print',
  'adjustments',
  'compare',
  'reset-adjustments',
  'preset-vivid',
  'preset-grayscale',
]);
const browsingKey = (command: string): ImageKeyIntent =>
  Object.freeze({ command, dismissMenus: true, refocus: 'browsing-list' });
const KEY_INTENTS: Readonly<Record<string, ImageKeyIntent>> = {
  ArrowLeft: browsingKey('previous'),
  ArrowUp: browsingKey('previous'),
  ArrowRight: browsingKey('next'),
  ArrowDown: browsingKey('next'),
  Enter: browsingKey('browse'),
  '+': browsingKey('zoom-in'),
  '=': browsingKey('zoom-in'),
  '-': browsingKey('zoom-out'),
  '0': browsingKey('fit'),
  '1': browsingKey('actual'),
  F1: browsingKey('help'),
  Escape: Object.freeze({ command: 'escape', dismissMenus: false, refocus: 'none' }),
  Home: Object.freeze({ command: 'home', dismissMenus: false, refocus: 'list' }),
  End: Object.freeze({ command: 'end', dismissMenus: false, refocus: 'list' }),
};

/** One image browsing session. Commands return intents; dialogs, file pickers and the slideshow timer stay in the HTML client. */
export class ImageBrowser {
  private records: ImageRecord[];
  private selectedId: string | undefined;
  private folder = '';
  private query = '';
  private sort: ImageSort = 'name';
  private descending = false;
  private view: ImageView = 'thumbnails';
  private zoom: number | 'fit' = 'fit';
  private rotation = 0;
  private flipX = false;
  private flipY = false;
  private adjustments = { ...DEFAULT_IMAGE_ADJUSTMENTS };
  private comparing = false;
  private slideshow = false;
  private revision = 0;

  constructor(
    records: readonly MediaRecord[],
    selectedId?: string,
    private readonly imageBase = '',
  ) {
    this.records = records.map(ownRecord);
    this.selectedId =
      this.records.find((item) => item.id === selectedId)?.id ?? this.items()[0]?.id;
  }
  private items(): ImageRecord[] {
    const direction = this.descending ? -1 : 1;
    return this.records
      .filter(
        (item) =>
          (!this.folder ||
            item.folders.some(
              (folder) => folder === this.folder || folder.startsWith(`${this.folder}/`),
            )) &&
          `${item.title} ${item.alt}`.toLocaleLowerCase().includes(this.query),
      )
      .sort((a, b) => {
        if (this.sort === 'size') {
          if (a.file?.bytes === undefined)
            return b.file?.bytes === undefined ? a.id.localeCompare(b.id) : 1;
          if (b.file?.bytes === undefined) return -1;
          return direction * (a.file.bytes - b.file.bytes) || a.id.localeCompare(b.id);
        }
        const difference =
          this.sort === 'date'
            ? a.date.localeCompare(b.date)
            : a.title.localeCompare(b.title, 'zh-CN');
        return direction * difference || a.id.localeCompare(b.id);
      });
  }
  snapshot(): ImageBrowserSnapshot {
    const items = this.items();
    return Object.freeze({
      items: Object.freeze(items),
      selected: items.find((item) => item.id === this.selectedId),
      folder: this.folder,
      query: this.query,
      sort: this.sort,
      descending: this.descending,
      view: this.view,
      zoom: this.zoom,
      rotation: this.rotation,
      flipX: this.flipX,
      flipY: this.flipY,
      adjustments: Object.freeze({ ...this.adjustments }),
      comparing: this.comparing,
      slideshow: this.slideshow,
    });
  }
  filter(folder: string, query = this.query): void {
    this.folder = folder;
    this.query = query.trim().toLocaleLowerCase();
    const items = this.items();
    if (!items.some((item) => item.id === this.selectedId)) {
      this.selectedId = items[0]?.id;
      this.resetView();
    }
  }
  order(sort: ImageSort, descending: boolean): void {
    this.sort = sort;
    this.descending = descending;
  }
  layout(view: ImageView): void {
    this.view = view;
  }
  select(id: string): boolean {
    if (!this.items().some((item) => item.id === id)) return false;
    if (this.selectedId !== id) this.resetView();
    this.selectedId = id;
    return true;
  }
  move(direction: number): void {
    if (!Number.isFinite(direction)) return;
    const items = this.items();
    if (!items.length) return;
    const current = Math.max(
      0,
      items.findIndex((item) => item.id === this.selectedId),
    );
    this.select(
      items[(current + (Math.trunc(direction) % items.length) + items.length) % items.length].id,
    );
  }
  setZoom(zoom: number | 'fit'): void {
    if (zoom !== 'fit' && !Number.isFinite(zoom)) return;
    this.zoom = zoom === 'fit' ? zoom : Math.min(8, Math.max(0.125, zoom));
  }
  rotate(direction = 1): void {
    if (!Number.isFinite(direction)) return;
    this.rotation = (((this.rotation + Math.round(direction) * 90) % 360) + 360) % 360;
    this.revision++;
  }
  flip(axis: 'x' | 'y'): void {
    if (axis === 'x') this.flipX = !this.flipX;
    else this.flipY = !this.flipY;
    this.revision++;
  }
  adjust(patch: Partial<ImageAdjustments>): void {
    const next = normalizeImageAdjustments(patch, this.adjustments);
    if (
      next.brightness === this.adjustments.brightness &&
      next.contrast === this.adjustments.contrast &&
      next.saturation === this.adjustments.saturation
    )
      return;
    this.adjustments = next;
    this.revision++;
  }
  preset(preset: ImagePreset): void {
    this.adjust(
      preset === 'vivid'
        ? { brightness: 4, contrast: 112, saturation: 125 }
        : { brightness: 0, contrast: 100, saturation: 0 },
    );
    this.comparing = false;
  }
  compare(value: boolean): void {
    this.comparing = value;
  }
  resetAdjustments(): void {
    this.adjust(DEFAULT_IMAGE_ADJUSTMENTS);
    this.comparing = false;
  }
  copyRequest(): ImageCopyRequest | undefined {
    const selected = this.snapshot().selected;
    return (
      selected && {
        id: selected.id,
        source: imageProcessingSource(selected, this.imageBase),
        title: selected.title,
        revision: this.revision,
        edit: {
          rotation: this.rotation,
          flipX: this.flipX,
          flipY: this.flipY,
          adjustments: { ...this.adjustments },
        },
      }
    );
  }
  isCurrentCopy(request: ImageCopyRequest): boolean {
    const selected = this.snapshot().selected;
    return (
      this.revision === request.revision &&
      selected?.id === request.id &&
      imageProcessingSource(selected, this.imageBase) === request.source
    );
  }
  resetView(): void {
    this.zoom = 'fit';
    this.rotation = 0;
    this.flipX = false;
    this.flipY = false;
    this.adjustments = { ...DEFAULT_IMAGE_ADJUSTMENTS };
    this.comparing = false;
    this.revision++;
  }
  add(records: readonly MediaRecord[]): void {
    const known = new Set(this.records.map((item) => item.id));
    for (const record of records) {
      if (known.has(record.id)) continue;
      this.records.push(ownRecord(record));
      known.add(record.id);
    }
    this.filter('Local files', '');
    if (records[0]) this.select(records[0].id);
  }
  /** Accepted keys. Toolbar, dialog, menu and field targets are rejected before this is called. */
  keyIntent(key: string): ImageKeyIntent | undefined {
    return Object.hasOwn(KEY_INTENTS, key) ? KEY_INTENTS[key] : undefined;
  }
  /** Stops the slideshow flag. The client clears its timer when this returns an intent. */
  haltSlideshow(): readonly ImageBrowserIntent[] {
    if (!this.slideshow) return [];
    this.slideshow = false;
    return [{ type: 'slideshow', running: false }];
  }
  /** Applies a command id from a control or an accepted key. */
  perform(id: string, context: ImageCommandContext = {}): readonly ImageBrowserIntent[] {
    if (id === 'slideshow') return this.toggleSlideshow(Boolean(context.reducedMotion));
    return [...this.haltSlideshow(), ...this.commandIntent(id, context)];
  }
  /** Selects a listed image and leaves the slideshow. */
  choose(id: string): readonly ImageBrowserIntent[] {
    const stopped = this.haltSlideshow();
    this.select(id);
    return [...stopped, ...this.rendered()];
  }
  /** Changes folder or query, leaves the slideshow, and asks for a rebuilt list. */
  filterTo(folder: string, query: string): readonly ImageBrowserIntent[] {
    const stopped = this.haltSlideshow();
    this.filter(folder, query);
    return [...stopped, ...this.rendered(true)];
  }
  commandDisabled(command: string, availability: ImageCommandAvailability): boolean {
    const state = this.snapshot();
    if (command === 'cancel-export') return !availability.exportBusy;
    if (command === 'export-copy') return !state.selected || availability.exportBusy;
    if (command === 'slideshow') return availability.reducedMotion || state.items.length < 2;
    return !state.selected && SELECTION_COMMANDS.has(command);
  }
  private toggleSlideshow(reducedMotion: boolean): readonly ImageBrowserIntent[] {
    if (this.slideshow) return this.haltSlideshow();
    if (reducedMotion || this.items().length < 2) return [];
    this.slideshow = true;
    return [{ type: 'slideshow', running: true }];
  }
  private commandIntent(id: string, context: ImageCommandContext): readonly ImageBrowserIntent[] {
    switch (id) {
      case 'open':
        return [{ type: 'open-files' }];
      case 'adjustments':
      case 'help':
        return [{ type: 'dialog', name: id, open: true }];
      case 'close-adjustments':
        return [{ type: 'dialog', name: 'adjustments', open: false }];
      case 'close-help':
        return [{ type: 'dialog', name: 'help', open: false }];
      case 'close-properties':
        return [{ type: 'dialog', name: 'properties', open: false }];
      case 'properties':
        return this.snapshot().selected ? [{ type: 'dialog', name: 'properties', open: true }] : [];
      case 'export-copy':
        return [{ type: 'export' }];
      case 'cancel-export':
        return [{ type: 'cancel-export', message: 'Export cancelled.' }, ...this.rendered()];
      case 'browse':
        return [{ type: 'mode', mode: 'toggle' }];
      case 'escape':
        return [{ type: 'mode', mode: 'browse' }];
      case 'clear-search':
        this.filter(this.folder, '');
        return [...this.rendered(true), { type: 'search', value: '', focus: true }];
      case 'print':
        return [{ type: 'print' }];
      case 'pixel':
        return [{ type: 'pixel' }, ...this.rendered()];
      case 'previous':
        this.move(-1);
        return this.rendered();
      case 'next':
        this.move(1);
        return this.rendered();
      case 'home':
      case 'end':
        return this.selectEdge(id);
      case 'fit':
        this.setZoom('fit');
        return this.rendered();
      case 'actual':
        this.setZoom(1);
        return this.rendered();
      case 'zoom-in':
        this.setZoom(this.zoomFactor(context) * 2);
        return this.rendered();
      case 'zoom-out':
        this.setZoom(this.zoomFactor(context) / 2);
        return this.rendered();
      case 'rotate-left':
        this.rotate(-1);
        return this.rendered();
      case 'rotate-right':
        this.rotate();
        return this.rendered();
      case 'flip-x':
        this.flip('x');
        return this.rendered();
      case 'flip-y':
        this.flip('y');
        return this.rendered();
      case 'reset':
        this.resetView();
        return this.rendered();
      case 'reverse':
        this.order(this.sort, !this.descending);
        return this.rendered(true);
      case 'compare':
        this.compare(!this.comparing);
        return this.rendered();
      case 'reset-adjustments':
        this.resetAdjustments();
        return this.rendered();
      case 'preset-vivid':
      case 'preset-grayscale':
        this.preset(id === 'preset-vivid' ? 'vivid' : 'grayscale');
        return this.rendered();
      default:
        return this.rendered();
    }
  }
  private selectEdge(edge: 'home' | 'end'): readonly ImageBrowserIntent[] {
    const items = this.items();
    const item = edge === 'home' ? items[0] : items.at(-1);
    if (item) this.select(item.id);
    return this.rendered();
  }
  private zoomFactor(context: ImageCommandContext): number {
    return typeof context.zoom === 'number'
      ? context.zoom
      : typeof this.zoom === 'number'
        ? this.zoom
        : 1;
  }
  private rendered(rebuild = false): readonly ImageBrowserIntent[] {
    return [{ type: 'render', rebuild }];
  }
}
