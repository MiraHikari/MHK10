import { describe, expect, it } from 'vite-plus/test';
import {
  PREVIEW_SIZE,
  PREVIEW_TASKBAR,
  PREVIEW_WINDOW,
  dragWindow,
  hitTest,
  layoutMicroDesktop,
  trayClock,
} from './desktop-offer-preview-model';

describe('micro desktop preview geometry', () => {
  it('lays the appWindow, taskbar and start menu inside the 640×360 surface', () => {
    const desktop = layoutMicroDesktop({ startOpen: true });
    expect(desktop.field.h + PREVIEW_TASKBAR).toBe(PREVIEW_SIZE.height);
    expect(desktop.taskbar.y).toBe(PREVIEW_SIZE.height - PREVIEW_TASKBAR);
    expect(desktop.appWindow.w).toBe(PREVIEW_WINDOW.width);
    expect(desktop.startMenu).not.toBeNull();
    const menu = desktop.startMenu!;
    expect(menu.y + menu.h).toBeLessThanOrEqual(desktop.taskbar.y);
    expect(menu.x).toBeGreaterThanOrEqual(0);
  });

  it('keeps a dragged window fully reachable', () => {
    expect(dragWindow({ x: -400, y: -400 })).toEqual({ x: 8, y: 4 });
    const far = dragWindow({ x: 5000, y: 5000 });
    expect(far.x + PREVIEW_WINDOW.width).toBeLessThanOrEqual(PREVIEW_SIZE.width - 8);
    expect(far.y + PREVIEW_WINDOW.height).toBeLessThanOrEqual(
      PREVIEW_SIZE.height - PREVIEW_TASKBAR - 8,
    );
    expect(Number.isInteger(far.x)).toBe(true);
    expect(Number.isInteger(far.y)).toBe(true);
  });

  it('reports the part of the window a press lands on', () => {
    const desktop = layoutMicroDesktop({});
    const { title, close, start } = desktop;
    expect(hitTest(desktop, { x: title.x + 4, y: title.y + 4 })).toBe('title');
    expect(hitTest(desktop, { x: close.x + 2, y: close.y + 2 })).toBe('close');
    expect(hitTest(desktop, { x: start.x + 2, y: start.y + 2 })).toBe('start');
    expect(hitTest(desktop, { x: 1, y: desktop.taskbar.y - 2 })).toBeNull();
  });

  it('formats the tray clock in either convention', () => {
    const morning = new Date(2026, 10, 22, 9, 4);
    const evening = new Date(2026, 10, 22, 21, 30);
    expect(trayClock(morning)).toBe('09:04');
    expect(trayClock(evening)).toBe('21:30');
    expect(trayClock(morning, false)).toBe('9:04 AM');
    expect(trayClock(evening, false)).toBe('9:30 PM');
  });
});
