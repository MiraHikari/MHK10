import { expect, test, type Locator, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { bootDesktop, clickPixel } from './helpers';

interface MotionFrame {
  at: number;
  visible: boolean;
  clientWidth: number;
  outline: { x: number; y: number; w: number; h: number } | null;
  image?: string;
}

/** Observe rendered pixels and iframe visibility; all actions still use real input. */
async function recordMotion(
  canvas: Locator,
  action: () => Promise<void>,
  info: TestInfo,
  label: string,
): Promise<MotionFrame[]> {
  const recording = canvas.evaluate(
    (element: HTMLCanvasElement) =>
      new Promise<MotionFrame[]>((resolve) => {
        const frames: MotionFrame[] = [];
        const start = performance.now();
        const capture = () => {
          const width = element.width,
            height = element.height - 22;
          const { data } = element.getContext('2d')!.getImageData(0, 0, width, height);
          const ink = (x: number, y: number) => {
            const at = (y * width + x) * 4;
            if (data[at] !== data[at + 1] || data[at] !== data[at + 2]) return -1;
            return data[at] === 0 ? 0 : data[at] === 255 ? 1 : -1;
          };
          const edges: { x: number; y: number; w: number }[] = [];
          for (let y = 0; y < height - 1; y++) {
            let left = 0,
              previous = -1;
            for (let x = 0; x <= width; x++) {
              const color = x === width ? -1 : ink(x, y);
              const pair = x === width ? -1 : ink(x, y + 1);
              if (color < 0 || pair < 0 || pair === color || color === previous) {
                if (x - left >= 24) edges.push({ x: left, y, w: x - left });
                left = x + 1;
                previous = -1;
              } else previous = color;
            }
          }
          const longest = Math.max(0, ...edges.map((edge) => edge.w));
          const matches = edges.filter((edge) => edge.w >= longest - 2 && edge.w >= 24);
          const top = matches[0],
            bottom = matches.at(-1);
          const outline =
            top && bottom && bottom.y > top.y + 2
              ? { x: top.x, y: top.y, w: top.w, h: bottom.y - top.y + 2 }
              : null;
          const frame = document.querySelector<HTMLIFrameElement>(
            'iframe[data-html-window="home"]',
          );
          frames.push({
            at: performance.now() - start,
            visible: !!frame && frame.getClientRects().length > 0,
            clientWidth: frame?.getBoundingClientRect().width ?? 0,
            outline,
            ...(outline ? { image: element.toDataURL('image/png') } : {}),
          });
          if (performance.now() - start < 600) requestAnimationFrame(capture);
          else resolve(frames);
        };
        requestAnimationFrame(capture);
      }),
  );
  await action();
  const frames = await recording;
  const outlines = frames.filter((frame) => frame.outline);
  for (const [position, frame] of [
    ['start', outlines[0]],
    ['middle', outlines[Math.floor(outlines.length / 2)]],
    ['end', outlines.at(-1)],
  ] as const) {
    if (frame?.image) {
      const path = info.outputPath(`${label}-${position}.png`);
      await writeFile(path, Buffer.from(frame.image.split(',')[1], 'base64'));
      await info.attach(`${label}-${position}`, { path, contentType: 'image/png' });
    }
  }
  await info.attach(`${label}-geometry`, {
    body: JSON.stringify(
      frames.map(({ image: _image, ...frame }) => frame),
      null,
      2,
    ),
    contentType: 'application/json',
  });
  return frames;
}

test.describe('Windows 95 outline transitions', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('closing a desktop-launched window follows its icon after adaptive reflow', async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, 'The desktop project exercises changing logical work areas.');
    await page.setViewportSize({ width: 720, height: 440 });
    const canvas = await bootDesktop(page, '/lab/');
    await recordMotion(canvas, () => canvas.press('Control+F4'), info, 'reflow-initial-close');
    await clickPixel(canvas, 128, 22);
    await canvas.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await canvas.press('Enter');
    await expect(canvas).toHaveAttribute('aria-label', /Recycle Bin/);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await expect(canvas).toHaveAttribute('height', '480');
    const frames = await recordMotion(
      canvas,
      () => canvas.press('Control+F4'),
      info,
      'reflow-close-to-icon',
    );
    await expect(canvas).not.toHaveAttribute('aria-label', /Recycle Bin/);
    expect(
      frames.some(({ outline }) => outline && outline.x < 80 && outline.y > 300 && outline.w < 200),
    ).toBe(true);
  });

  test('anchors maximize, minimize, task restore and icon launch without scaling HTML', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const canvas = await bootDesktop(page);
    const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
      w: element.width,
      h: element.height,
    }));
    const home = page.locator('iframe[data-html-window="home"]');
    const normalWidth = await home.evaluate((element) => element.getBoundingClientRect().width);
    const maximize = await recordMotion(
      canvas,
      () => clickPixel(canvas, 600, 26),
      info,
      'maximize',
    );
    await expect(home).toBeVisible();
    const maximumWidth = await home.evaluate((element) => element.getBoundingClientRect().width);
    expect(maximumWidth).toBeGreaterThan(normalWidth);
    expect(
      maximize.some(
        (frame) =>
          !frame.visible && frame.outline && frame.outline.w > 540 && frame.outline.w < size.w,
      ),
    ).toBe(true);
    expect(
      maximize
        .filter((frame) => frame.visible)
        .every(
          (frame) =>
            Math.abs(frame.clientWidth - normalWidth) < 1 ||
            Math.abs(frame.clientWidth - maximumWidth) < 1,
        ),
    ).toBe(true);

    const unmaximize = await recordMotion(
      canvas,
      () => clickPixel(canvas, size.w - 32, 10),
      info,
      'restore-size',
    );
    await expect
      .poll(() => home.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(normalWidth);
    expect(unmaximize.some((frame) => !frame.visible && frame.outline)).toBe(true);

    const minimize = await recordMotion(
      canvas,
      () => clickPixel(canvas, 584, 26),
      info,
      'minimize',
    );
    await expect(home).toBeHidden();
    expect(
      minimize.some(
        ({ outline }) =>
          outline && outline.y > 100 && outline.x > 92 && outline.x <= 130 && outline.w < 500,
      ),
    ).toBe(true);
    const restore = await recordMotion(
      canvas,
      () => clickPixel(canvas, 174, size.h - 11),
      info,
      'task-restore',
    );
    await expect(home).toBeVisible();
    expect(
      restore.some(
        ({ visible, outline }) =>
          !visible && outline && outline.y > 50 && outline.x > 92 && outline.x <= 130,
      ),
    ).toBe(true);
    expect(await home.evaluate((element) => element.getBoundingClientRect().width)).toBe(
      normalWidth,
    );

    await canvas.focus();
    await recordMotion(canvas, () => page.keyboard.press('Control+F4'), info, 'close-to-caption');
    await expect(home).toHaveCount(0);
    await clickPixel(canvas, 44, 22);
    await canvas.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const open = await recordMotion(canvas, () => canvas.press('Enter'), info, 'icon-open');
    await expect(home).toBeVisible();
    expect(
      open.some(
        ({ visible, outline }) =>
          !visible && outline && outline.x < 92 && outline.y < 60 && outline.w < 450,
      ),
    ).toBe(true);
    const close = await recordMotion(
      canvas,
      () => canvas.press('Control+F4'),
      info,
      'close-to-icon',
    );
    await expect(home).toHaveCount(0);
    expect(
      close.some(({ outline }) => outline && outline.x < 92 && outline.y < 60 && outline.w < 250),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('reduced motion applies final bounds and keeps restoring functional', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const canvas = await bootDesktop(page);
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  const home = page.locator('iframe[data-html-window="home"]');
  const before = await home.evaluate((element) => element.getBoundingClientRect().width);
  await clickPixel(canvas, 600, 26);
  await expect
    .poll(() => home.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(before);
  await clickPixel(canvas, size.w - 32, 10);
  await expect
    .poll(() => home.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(before);
  await clickPixel(canvas, 584, 26);
  await expect(home).toBeHidden();
  await clickPixel(canvas, 174, size.h - 11);
  await expect(home).toBeVisible();
  await info.attach('reduced-motion-restored', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
