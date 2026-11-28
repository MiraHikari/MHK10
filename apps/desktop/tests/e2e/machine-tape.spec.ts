import { expect, test, type Page } from '@playwright/test';
import { bootDesktop, chooseMenu, clickPixel } from './helpers';

async function observeTape(page: Page) {
  await page.addInitScript(() => {
    const activity = {
      microphone: 0,
      calls: [] as { element: HTMLMediaElement; start: number; source: string }[],
    };
    Reflect.set(window, '__machineTapeActivity', activity);
    const play = Reflect.get(HTMLMediaElement.prototype, 'play') as (
      this: HTMLMediaElement,
    ) => Promise<void>;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('/sounds/machine-tape/')) {
        activity.calls.push({ element: this, start: this.currentTime, source: this.src });
      }
      return play.call(this);
    };
    const microphone = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
    if (microphone) {
      navigator.mediaDevices.getUserMedia = function (constraints) {
        activity.microphone++;
        return microphone(constraints);
      };
    }
  });
  return () =>
    page.evaluate(() => {
      const activity = Reflect.get(window, '__machineTapeActivity') as {
        microphone: number;
        calls: { element: HTMLMediaElement; start: number; source: string }[];
      };
      return {
        microphone: activity.microphone,
        clips: activity.calls.map(({ element, start, source }) => ({
          start,
          source,
          position: element.currentTime,
          paused: element.paused,
          released: !element.hasAttribute('src'),
        })),
      };
    });
}

test('Sound Recorder sample tape switches real clips at one playhead and releases on Stop or Exit', async ({
  page,
}, info) => {
  const observed = await observeTape(page);
  const requested: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/sounds/machine-tape/')) requested.push(request.url());
  });
  await page.goto('/apps/sound-recorder/');
  const status = page.locator('[data-app-status]');
  const canvas = page.locator('canvas');
  await expect(status).toHaveText('0 tones | Ready');
  await clickPixel(canvas, 155, 15);
  await expect(status).toHaveText('Tape A | Ready');
  await canvas.press('b');
  await expect(status).toHaveText('Tape B | Ready');
  expect(requested).toEqual([]);
  expect(await observed()).toEqual({ microphone: 0, clips: [] });
  await canvas.press('a');
  await canvas.press('Enter');
  await expect(status).toHaveText('Tape A | Playing');
  await expect
    .poll(async () => (await observed()).clips.at(-1)?.position ?? 0)
    .toBeGreaterThan(0.46);
  await canvas.press('b');
  await expect(status).toHaveText('Tape B | Playing');
  const switched = (await observed()).clips;
  expect(switched).toHaveLength(2);
  expect(switched[0]).toMatchObject({ paused: true, released: true });
  expect(switched[1].source).toMatch(/ibm-m2-b\.wav$/);
  expect(switched[1].start).toBeGreaterThan(0.42);
  await canvas.press('Enter');
  await expect(status).toHaveText('Tape B | Paused');
  await page.locator('#app-host').screenshot({ path: info.outputPath('machine-tape-B.png') });
  await canvas.press('a');
  await expect(status).toHaveText('Tape A | Paused');
  expect((await observed()).clips).toHaveLength(2);
  await canvas.press('r');
  await expect(status).toHaveText('Tape A | Playing');
  expect((await observed()).clips.at(-1)?.start).toBe(0);
  await canvas.press('s');
  await expect(status).toHaveText('Tape A | Ready');
  expect((await observed()).clips.at(-1)).toMatchObject({ paused: true, released: true });
  await canvas.press('Enter');
  await expect(status).toHaveText('Tape A | Playing');
  await chooseMenu(page, 'File', 'Exit');
  await expect(status).toHaveText('Application closed.');
  expect(await observed()).toMatchObject({ microphone: 0 });
  expect((await observed()).clips.every((clip) => clip.paused && clip.released)).toBe(true);
});

test('Sound Recorder keeps the tape usable if a local audio file cannot load', async ({ page }) => {
  await page.route('**/sounds/machine-tape/**', (route) => route.abort());
  await page.goto('/apps/sound-recorder/');
  const canvas = page.locator('canvas');
  const status = page.locator('[data-app-status]');
  await expect(status).toHaveText('0 tones | Ready');
  await canvas.press('t');
  await expect(status).toHaveText('Tape A | Ready');
  await canvas.press('Enter');
  await expect(status).toHaveText('Tape A | Audio unavailable');
  await canvas.press('Escape');
  await expect(status).toHaveText('0 tones | Ready');
});

test('Sound Recorder sample tape releases the source when the full desktop minimizes it', async ({
  page,
}) => {
  const observed = await observeTape(page);
  const canvas = await bootDesktop(page, '/lab/');
  await canvas.focus();
  await canvas.press('Alt+F2');
  await expect(canvas).toHaveAttribute('aria-label', /Run/);
  await page.keyboard.type('sndrec32');
  await canvas.press('Enter');
  await expect(canvas).toHaveAttribute('aria-label', /Sound Recorder/);
  await canvas.press('t');
  await canvas.press('Enter');
  await expect
    .poll(async () => (await observed()).clips.at(-1)?.position ?? 0)
    .toBeGreaterThan(0.3);
  await canvas.press('Control+Alt+d');
  await expect(canvas).toHaveAttribute('aria-label', 'MHK10 desktop');
  await expect.poll(async () => (await observed()).clips.at(-1)?.released).toBe(true);
  await canvas.press('Control+Alt+d');
  await expect(canvas).toHaveAttribute('aria-label', /Sound Recorder/);
  expect((await observed()).clips).toHaveLength(1);
  await canvas.press('Enter');
  await expect.poll(async () => (await observed()).clips.at(-1)?.start ?? 0).toBeGreaterThan(0.25);
  await canvas.press('Control+F4');
  await expect.poll(async () => (await observed()).clips.at(-1)?.released).toBe(true);
  expect((await observed()).microphone).toBe(0);
});
