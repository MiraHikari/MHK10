import { describe, expect, it, vi } from 'vite-plus/test';
import type { AppServices } from '../../os/host/app-contracts';
import type { SaveTextResult } from '../../os/files/save-request';
import { parsePixelBitmap } from './pixel-model';
import { appTestFixture } from '../testing/app-test-fixture';

async function fixture() {
  const { pixelApp } = await import('./pixel.app');
  const { createFileSystem } = await import('../../os/files/filesystem');
  const { createStory } = await import('../../os/story/story');
  const data = new Map<string, string>();
  const files = createFileSystem({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  });
  let complete!: (result: SaveTextResult) => void;
  const env = {
    files,
    story: createStory(),
    saveText: vi.fn(
      () =>
        new Promise<SaveTextResult>((resolve) => {
          complete = resolve;
        }),
    ),
    setTitle: vi.fn(),
    msg: vi.fn(),
    close: vi.fn(),
    downloadText: vi.fn(),
    desktop: { setPixelWallpaper: vi.fn() },
  } as unknown as AppServices;
  const view = {
    win: { id: 'pixel', menu: { open: -1 } },
    client: { x: 0, y: 0, w: 464, h: 250 },
    menuSel: null,
    focused: true,
    pointerIn: true,
  };
  const c = appTestFixture(pixelApp, env, view.client);
  const { session } = c;
  const queueInput = c.input.queueInput;
  const drawGesture = () => {
    queueInput({ px: 70, py: 8, down: true });
    queueInput({ px: 78, py: 8, down: false });
  };
  const frame = (command?: string) => {
    if (command) c.command(command);
    else c.frame();
  };
  const saved = (content: string): SaveTextResult => ({
    status: 'saved',
    persisted: true,
    file: files.createText('Drawing.pixel', content).file!,
  });
  return {
    env,
    session,
    drawGesture,
    frame,
    saved,
    complete: (result: SaveTextResult) => complete(result),
  };
}

describe('PIXEL session input and close ordering', () => {
  it('allows clean images to unload and protects changed or saving images without prompting', async () => {
    const c = await fixture();
    expect(c.session.prepareUnload()).toBe(true);
    c.drawGesture();
    c.frame();
    expect(c.session.prepareUnload()).toBe(false);
    expect(c.env.msg).not.toHaveBeenCalled();
    c.frame('save');
    expect(c.session.prepareUnload()).toBe(false);
    const content = vi.mocked(c.env.saveText).mock.calls[0][0].content;
    c.complete(c.saved(content));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.session.prepareUnload()).toBe(true);
  });
  it('saves a complete gesture accepted in the same frame before closing', async () => {
    const c = await fixture();
    c.drawGesture();
    const closing = c.session.requestClose();
    c.frame('save');
    const request = vi.mocked(c.env.saveText).mock.calls[0][0];
    expect(parsePixelBitmap(request.content)!.pixels.filter((pixel) => pixel === 0)).toHaveLength(
      5,
    );
    expect(c.session.closed).toBe(false);
    c.complete(c.saved(request.content));
    expect(await closing).toBe(true);
    expect(c.env.msg).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'failed'] as const)(
    'keeps the drawing usable when a pending save is %s',
    async (status) => {
      const c = await fixture();
      c.drawGesture();
      const closing = c.session.requestClose();
      c.frame('save');
      const content = vi.mocked(c.env.saveText).mock.calls[0][0].content;
      c.complete(status === 'failed' ? { status, error: 'Disk full.' } : { status });
      expect(await closing).toBe(false);
      expect(c.session.closed).toBe(false);
      c.frame('export');
      expect(c.env.downloadText).toHaveBeenCalledWith('Untitled.pixel', content);
    },
  );

  it('requires an explicit discard choice and cancels closing without losing work', async () => {
    const c = await fixture();
    c.drawGesture();
    c.frame();
    const first = c.session.requestClose();
    await c.session.flushClose();
    expect(await first).toBe(false);
    const prompt = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    expect(prompt.buttons).toEqual(['Save', 'Discard', 'Cancel']);
    prompt.onBtn?.(2, c.env);
    expect(c.env.close).not.toHaveBeenCalled();
    c.frame('export');
    expect(
      parsePixelBitmap(vi.mocked(c.env.downloadText).mock.calls[0][1])!.pixels.filter(
        (pixel) => pixel === 0,
      ),
    ).toHaveLength(5);
    const second = c.session.requestClose();
    await c.session.flushClose();
    expect(await second).toBe(false);
    vi.mocked(c.env.msg).mock.calls.at(-1)![0].onBtn?.(1, c.env);
    expect(c.env.close).toHaveBeenCalledWith('pixel');
    const final = c.session.requestClose();
    await c.session.flushClose();
    expect(await final).toBe(true);
  });

  it('sends the current indexed image through the wallpaper capability', async () => {
    const c = await fixture();
    c.drawGesture();
    c.frame('wallpaper');
    expect(c.env.desktop!.setPixelWallpaper).toHaveBeenCalledWith(
      expect.objectContaining({ width: 192, height: 100 }),
    );
    expect(
      vi
        .mocked(c.env.desktop!.setPixelWallpaper)
        .mock.calls[0][0].pixels.filter((pixel) => pixel === 0),
    ).toHaveLength(5);
  });
});
