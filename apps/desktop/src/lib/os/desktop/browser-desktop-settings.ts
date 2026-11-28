import { STORAGE_KEYS } from '../../../data/storage-keys';
import { THEMES, themeFor } from '../../gfx/palette';
import type { Renderer } from '../../gfx/context';
import type { AudioService } from '../audio/pcspeaker';

import { createPrintLayout } from '../../ui/text/print-layout';
import {
  parseDesktopSettings,
  parsePixelWallpaper,
  type DesktopCapabilities,
  type DesktopSettings,
  type Saver,
} from './desktop-settings';

const KEY = STORAGE_KEYS.desktop;
const PIXEL_KEY = STORAGE_KEYS.pixelWallpaper;
/** Host-owned settings adapter. Storage failures preserve a usable session preference. */
export function createDesktopSettings(
  draw: Pick<Renderer, 'setWallpaper' | 'setPixelWallpaper'>,
  audio: AudioService,
  preview: (saver: Saver) => void = () => {},
) {
  let settings = parseDesktopSettings(null);
  try {
    settings = parseDesktopSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    /* Defaults. */
  }
  try {
    const pixel = parsePixelWallpaper(JSON.parse(localStorage.getItem(PIXEL_KEY) ?? 'null'));
    if (pixel) draw.setPixelWallpaper(pixel);
  } catch {
    /* No custom image. */
  }
  try {
    const storedWallpaper = localStorage.getItem(STORAGE_KEYS.wallpaper);
    const wallpaper = storedWallpaper === null ? NaN : Number(storedWallpaper);
    if (wallpaper === 0 || wallpaper === 1 || wallpaper === 2 || wallpaper === 3)
      draw.setWallpaper(wallpaper);
  } catch {
    /* Default wallpaper. */
  }
  audio.setVolume(settings.volume);
  // 音量滑杆在拖动时每帧都会调用 updateSettings：内存值立即生效，落盘
  // 合并成 ~250ms 一次，页面隐藏/卸载前强制 flush，避免整段 JSON +
  // localStorage.setItem 跑在拖动帧上。
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (persistTimer !== undefined) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* Session preference. */
    }
  };
  const schedulePersist = () => {
    if (persistTimer !== undefined) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, 250);
  };
  const persistOnLeave = () => flush();
  const persistOnHide = () => {
    if (document.hidden) flush();
  };
  // 测试宿主（非 DOM 环境）没有 window/document，直接跳过生命周期钩子。
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
    window.addEventListener('pagehide', persistOnLeave);
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function')
    document.addEventListener('visibilitychange', persistOnHide);
  const setWallpaper = (value: 0 | 1 | 2 | 3) => {
    draw.setWallpaper(value);
    try {
      localStorage.setItem(STORAGE_KEYS.wallpaper, String(value));
    } catch {
      /* Session wallpaper. */
    }
  };
  const capabilities: DesktopCapabilities = {
    getSettings: () => ({ ...settings, volume: audio.getVolume() }),
    updateSettings(patch) {
      settings = parseDesktopSettings({ ...settings, volume: audio.getVolume(), ...patch });
      audio.setVolume(settings.volume);
      // 音量滑杆逐帧写；其余设置是离散操作，立即落盘以保证重新挂载即可读回。
      const keys = Object.keys(patch);
      if (keys.length === 1 && keys[0] === 'volume') schedulePersist();
      else flush();
    },
    setPixelWallpaper(bitmap) {
      const safe = parsePixelWallpaper(bitmap);
      if (!safe) return;
      draw.setPixelWallpaper(safe);
      draw.setWallpaper(3);
      try {
        localStorage.setItem(PIXEL_KEY, JSON.stringify(safe));
        localStorage.setItem(STORAGE_KEYS.wallpaper, '3');
      } catch {
        /* Session wallpaper. */
      }
    },
    async printDocument(title, content, suppliedLayout) {
      const print = document.createElement('iframe');
      print.title = 'Print document';
      print.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px';
      document.body.append(print);
      const doc = print.contentDocument;
      const win = print.contentWindow;
      if (!doc || !win) {
        print.remove();
        throw new Error('The printer could not be opened.');
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const style = doc.createElement('style');
        const fontUrl = new URL(
          '/fonts/fusion-pixel/fusion-pixel-12px-proportional-zh-hans.woff2',
          location.origin,
        ).href;
        style.textContent = `@font-face{font-family:"MHK CJK";src:url("${fontUrl}") format("woff2");font-style:normal;font-weight:400;ascent-override:83.333333%;descent-override:50%;line-gap-override:0%}@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;color:black;background:white}*{box-sizing:border-box}.print-page{width:210mm;height:297mm;position:relative;break-after:page;overflow:hidden}.print-page:last-child{break-after:auto}.print-page>*{position:absolute;margin:0;font-family:"MHK CJK",monospace;font-synthesis:none;font-kerning:none;font-variant-ligatures:none;white-space:pre;overflow:hidden}.print-header{border-bottom:0.2mm solid black}.print-footer{border-top:0.2mm solid black;text-align:right}`;
        doc.head.append(style);
        await Promise.race([
          doc.fonts.load('12px "MHK CJK"', 'MiraHikari 国。'),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('The print font did not load.')), 5000);
          }),
        ]);
        const measure = doc.createElement('canvas').getContext('2d');
        if (!measure) throw new Error('The printer could not measure the document.');
        measure.font = '12px "MHK CJK", monospace';
        measure.fontKerning = 'none';
        const layout =
          suppliedLayout ??
          createPrintLayout(content, (value) => Math.round(measure.measureText(value).width));
        const horizontal = 210 / layout.width,
          vertical = 297 / layout.height;
        layout.pages.forEach((lines, index) => {
          const page = doc.createElement('section');
          page.className = 'print-page';
          page.dataset.printPage = String(index + 1);
          page.setAttribute('aria-label', `Page ${index + 1} of ${layout.pages.length}`);
          const header = doc.createElement('header');
          header.className = 'print-header';
          header.textContent = title;
          const body = doc.createElement('pre');
          body.className = 'print-body';
          body.textContent = lines.join('\n');
          const footer = doc.createElement('footer');
          footer.className = 'print-footer';
          footer.textContent = `MHK10  |  ${index + 1} / ${layout.pages.length}`;
          for (const item of [header, body, footer]) {
            item.style.left = `${layout.margin * horizontal}mm`;
            item.style.width = `${(layout.width - layout.margin * 2) * horizontal}mm`;
            item.style.fontSize = `${layout.fontSize * horizontal}mm`;
            item.style.lineHeight = `${layout.lineHeight * vertical}mm`;
          }
          header.style.top = `${layout.margin * vertical}mm`;
          header.style.height = `${(layout.headerHeight - 8) * vertical}mm`;
          body.style.top = `${(layout.margin + layout.headerHeight) * vertical}mm`;
          footer.style.top = `${(layout.height - layout.margin - layout.footerHeight) * vertical}mm`;
          footer.style.paddingTop = `${6 * vertical}mm`;
          page.append(header, body, footer);
          doc.body.append(page);
        });
        win.focus();
        win.print();
      } finally {
        clearTimeout(timeout);
        print.remove();
      }
    },
    previewSaver: preview,
  };
  return {
    capabilities,
    setWallpaper,
    dispose() {
      flush();
      if (typeof window !== 'undefined') window.removeEventListener?.('pagehide', persistOnLeave);
      if (typeof document !== 'undefined')
        document.removeEventListener?.('visibilitychange', persistOnHide);
    },
    applyTheme(name: string) {
      if (!Object.hasOwn(THEMES, name)) return;
      const theme = themeFor(name);
      capabilities.updateSettings({ soundScheme: theme.soundScheme, cursorSet: theme.cursorSet });
      setWallpaper(theme.wallpaper);
      try {
        localStorage.setItem(STORAGE_KEYS.theme, name);
      } catch {
        /* Session theme. */
      }
    },
    update: (patch: Partial<DesktopSettings>) => capabilities.updateSettings(patch),
  };
}
