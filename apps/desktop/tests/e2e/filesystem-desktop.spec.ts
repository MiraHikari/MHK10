import { expect, test, type Locator } from '@playwright/test';
import { desktopIconGrid } from '../../src/lib/os/desktop/desktop-icon-layout';
import { APP_CATALOG } from '../../src/data/app-catalog';
import { bootDesktop, chooseMenu, clickPixel } from './helpers';

async function pressFrame(canvas: Locator, key: string) {
  await canvas.press(key);
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test('Explorer can change the default application for a known text file through Open With', async ({
  page,
}) => {
  await page.goto('/apps/computer/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await clickPixel(canvas, 80, 110);
  await pressFrame(canvas, 'Enter');
  await pressFrame(canvas, 'End');
  await chooseMenu(page, 'File', 'Open With...');
  const chooser = page.getByRole('dialog', { name: 'Open With', exact: true });
  await chooser.getByLabel('Always use this app for this file type').check();
  await chooser.getByRole('button', { name: 'Reader', exact: true }).click();
  await expect(page).toHaveURL(/\/blog\/\?file=diary/);
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('#reader-prose')).toContainText('Dear diary');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.associations.v1')))
    .toContain('blog');
});

test('desktop files use file associations and retain edits through the local file system', async ({
  page,
  viewport,
}, info) => {
  test.skip(
    !viewport || viewport.width < 900,
    'Keyboard icon traversal is covered on the desktop layout.',
  );
  await page.goto('/favicon.svg');
  await page.evaluate(() => {
    localStorage.setItem(
      'doom95.desktop.v1',
      JSON.stringify({ hasVisited: true, welcomeCompleted: true }),
    );
    localStorage.setItem(
      'doom95.files.v1',
      JSON.stringify({
        version: 1,
        folders: [],
        files: [
          {
            id: 'desktop-notes',
            name: 'Desktop Notes.txt',
            content: 'Ready on the desktop.\n',
            folder: 'desktop',
            source: 'visitor',
            deleted: false,
            readonly: false,
          },
        ],
      }),
    );
  });
  const canvas = await bootDesktop(page);
  await canvas.focus();
  await page.keyboard.press('Control+F4');
  await expect(page.locator('iframe[data-html-window]')).toHaveCount(0);
  const files = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
      files: { id: string; folder: string; deleted: boolean }[];
    };
    return data.files
      .filter((file) => file.folder === 'desktop' && !file.deleted)
      .map((file) => file.id);
  });
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  const position = desktopIconGrid(files, size.w, size.h - 22).find(
    (file) => file.id === 'desktop-notes',
  );
  if (!position) throw new Error('The desktop file is missing');
  await clickPixel(canvas, position.x + 42, position.y + 18);
  await pressFrame(canvas, 'Enter');
  await clickPixel(canvas, 240, 120);
  await canvas.focus();
  await page.keyboard.type('OPENED ');
  await page.keyboard.press('Control+S');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { id: string; content: string }[];
        };
        return saved.files?.find((file) => file.id === 'desktop-notes')?.content;
      }),
    )
    .toContain('OPENED ');
  await info.attach('Desktop file opened in Notepad', {
    body: await canvas.screenshot(),
    contentType: 'image/png',
  });
});

test('Explorer uses keyboard navigation, nested folders and clipboard without losing file types', async ({
  page,
}, info) => {
  await page.goto('/apps/computer/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await clickPixel(canvas, 80, 110);
  await pressFrame(canvas, 'Enter');
  await pressFrame(canvas, 'Control+Shift+N');
  await page.keyboard.type('Field Notes');
  await pressFrame(canvas, 'Enter');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain('Field Notes');
  await pressFrame(canvas, 'Enter');
  await pressFrame(canvas, 'Control+Shift+N');
  await page.keyboard.type('Drafts');
  await pressFrame(canvas, 'Enter');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('doom95.files.v1')))
    .toContain('Drafts');
  await pressFrame(canvas, 'Alt+ArrowUp');
  await pressFrame(canvas, 'End');
  await pressFrame(canvas, 'Control+c');
  await pressFrame(canvas, 'Home');
  await pressFrame(canvas, 'Enter');
  await pressFrame(canvas, 'Control+v');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { name: string; folder: string }[];
        };
        return saved.files?.find((file) => file.name === 'diary.txt' && file.folder === 'notes');
      }),
    )
    .toBeTruthy();
  await pressFrame(canvas, 'Home');
  await pressFrame(canvas, 'F2');
  await pressFrame(canvas, 'Control+a');
  await page.keyboard.type('Travel.txt');
  await pressFrame(canvas, 'Enter');
  await chooseMenu(page, 'File', 'Send to Desktop');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { folder: string; target?: { appId: string; fileId?: string } }[];
        };
        return saved.files?.some(
          (file) =>
            file.folder === 'desktop' && file.target?.appId === 'notepad' && !!file.target.fileId,
        );
      }),
    )
    .toBe(true);
  await chooseMenu(page, 'View', 'Sort by name');
  await canvas.screenshot({ path: info.outputPath('explorer-details.png') });
  await canvas.focus();
  await pressFrame(canvas, 'Delete');
  await page.goto('/apps/bin/');
  await expect(page.locator('[data-app-status]')).toContainText('1 deleted item');
  const bin = page.locator('canvas');
  await bin.focus();
  await pressFrame(bin, 'Home');
  await pressFrame(bin, 'Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { name: string; deleted: boolean }[];
        };
        return saved.files?.find((file) => file.name === 'Travel.txt')?.deleted;
      }),
    )
    .toBe(false);
});

test('Explorer drags files across the desktop and into child folders through real pointer input', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'The desktop pointer drag is covered at the desktop viewport.');
  await page.goto('/favicon.svg');
  await page.evaluate(() => {
    localStorage.setItem(
      'doom95.desktop.v1',
      JSON.stringify({
        resolutionMode: 'classic',
        hasVisited: true,
        welcomeCompleted: true,
        showAssistant: false,
        windowAnimations: false,
      }),
    );
    localStorage.setItem(
      'doom95.files.v1',
      JSON.stringify({
        version: 1,
        folders: [],
        files: [
          {
            id: 'drag-file',
            name: 'Drag Me.txt',
            content: 'Keep this content.',
            folder: 'root',
            source: 'visitor',
            deleted: false,
            readonly: false,
          },
        ],
      }),
    );
  });
  const canvas = await bootDesktop(page, '/lab/');
  await pressFrame(canvas, 'Alt+F2');
  await page.keyboard.type('explorer');
  await pressFrame(canvas, 'Enter');
  // My Computer's registered x=94,y=18; shared chrome places its client at x=97,y=58.
  await clickPixel(canvas, 177, 168);
  await pressFrame(canvas, 'Enter');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Desktop is not visible');
  const size = await canvas.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  const point = (x: number, y: number) => ({
    x: box.x + (x * box.width) / size.w,
    y: box.y + (y * box.height) / size.h,
  });
  const drag = async (toX: number, toY: number, screenshot?: string) => {
    const from = point(170, 189),
      to = point(toX, toY);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 14 });
    if (screenshot) await canvas.screenshot({ path: info.outputPath(screenshot) });
    await page.mouse.up();
  };
  await drag(600, 300, 'explorer-drag-to-desktop.png');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { name: string; folder: string }[];
        };
        return saved.files
          ?.filter((file) => file.name === 'Drag Me.txt')
          .map((file) => file.folder)
          .sort();
      }),
    )
    .toEqual(['desktop', 'root']);
  await drag(170, 126, 'explorer-drop-folder.png');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { id: string; folder: string }[];
        };
        return saved.files?.find((file) => file.id === 'drag-file')?.folder;
      }),
    )
    .toBe('notes');
});

test('Desktop is the same mutable shortcut directory in Explorer, the shell and Recycle Bin', async ({
  page,
}, info) => {
  await page.goto('/favicon.svg');
  await page.evaluate(() =>
    localStorage.setItem(
      'doom95.desktop.v1',
      JSON.stringify({ hasVisited: true, welcomeCompleted: true }),
    ),
  );
  await page.goto('/apps/computer/');
  const canvas = page.locator('canvas');
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await clickPixel(canvas, 80, 89);
  await pressFrame(canvas, 'Enter');
  const expected = APP_CATALOG.filter((app) => app.desktop?.length).map(
    (app) => `desktop:app:${app.id}`,
  );
  await expect(page.locator('[data-app-status]')).toContainText(`${expected.length} object(s)`);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { id: string; folder: string }[];
        };
        return data.files?.filter((file) => file.folder === 'desktop').map((file) => file.id);
      }),
    )
    .toEqual(expected);
  await page.keyboard.type('My Computer');
  await pressFrame(canvas, 'F2');
  await pressFrame(canvas, 'Control+a');
  await page.keyboard.type('Workbench');
  await pressFrame(canvas, 'Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { id: string; name: string; folder: string }[];
        };
        return data.files?.find((file) => file.id === 'desktop:app:computer');
      }),
    )
    .toMatchObject({ name: 'Workbench', folder: 'desktop' });
  await canvas.screenshot({ path: info.outputPath('desktop-directory-shortcuts.png') });
  const desktop = await bootDesktop(page);
  await pressFrame(desktop, 'Control+F4');
  await expect(page.locator('iframe[data-html-window]')).toHaveCount(0);
  const desktopSize = await desktop.evaluate((element: HTMLCanvasElement) => ({
    w: element.width,
    h: element.height,
  }));
  const workbench = desktopIconGrid(expected, desktopSize.w, desktopSize.h - 22).find(
    (item) => item.id === 'desktop:app:computer',
  )!;
  await desktop.screenshot({ path: info.outputPath('desktop-renamed-shortcut.png') });
  await clickPixel(desktop, workbench.x + 42, workbench.y + 18);
  // The shell accepts the pointer release in its next frame before icon keys.
  await desktop.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await pressFrame(desktop, 'Enter');
  await expect(desktop).toHaveAttribute('aria-label', /My Computer/);
  await page.goto('/apps/computer/');
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await clickPixel(canvas, 80, 89);
  await pressFrame(canvas, 'Enter');
  await page.keyboard.type('Workbench');
  await pressFrame(canvas, 'Delete');
  await page.reload();
  await expect(page.locator('[data-app-status]')).toContainText('object(s)');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { id: string; deleted: boolean }[];
        };
        return data.files?.find((file) => file.id === 'desktop:app:computer')?.deleted;
      }),
    )
    .toBe(true);
  await page.goto('/apps/bin/');
  await expect(page.locator('[data-app-status]')).toContainText('1 deleted item');
  await canvas.focus();
  await pressFrame(canvas, 'Home');
  await pressFrame(canvas, 'Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
          files?: { id: string; name: string; folder: string; deleted: boolean }[];
        };
        return data.files?.find((file) => file.id === 'desktop:app:computer');
      }),
    )
    .toMatchObject({ name: 'Workbench', folder: 'desktop', deleted: false });
});
