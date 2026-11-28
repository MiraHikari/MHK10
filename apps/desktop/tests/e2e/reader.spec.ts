import { expect, test, type FrameLocator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bootDesktop, chooseMenu, openNotepad } from './helpers';
async function choose(frame: FrameLocator, label: string, option: string) {
  await frame
    .getByRole('combobox', { name: label, exact: true })
    .and(frame.locator('button'))
    .click();
  await frame.getByRole('option', { name: option, exact: true }).click();
}

test('Reader paginates the complete article and resumes its reading position', async ({ page }) => {
  await bootDesktop(page, '/blog/advx-2026-hangzhou/');
  let reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('#reader-prose .photo-figure')).toHaveCount(44);
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'View' }).click();
  await reader.locator('[data-hybrid-menubar] [data-reader-command="options"]').click();
  await choose(reader, 'Layout', 'Pages');
  await choose(reader, 'Text size', '200% · 24 px');
  await choose(reader, 'Line spacing', 'Wide');
  await reader.locator('[data-reader-command="close-options"]').click();
  await expect(reader.locator('#microsoft-reader')).toHaveAttribute('data-layout', 'pages');
  await reader.locator('#reader-viewport').press('End');
  await expect(reader.locator('#reader-progress')).toHaveText('100%');
  await expect(reader.locator('#reader-prose')).toContainText(
    '明年再见吧示例市，还有 创客聚会 2027。',
  );
  const tail = reader.locator('#reader-prose p').last();
  const visible = await tail.evaluate((element) => {
    const content = element.getBoundingClientRect();
    const viewport = document.getElementById('reader-viewport')!.getBoundingClientRect();
    return content.left < viewport.right && content.right > viewport.left;
  });
  expect(visible).toBe(true);
  await page.reload();
  await page.locator('#screen').focus();
  await page.keyboard.press('Escape');
  reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('#microsoft-reader')).toHaveAttribute('data-layout', 'pages');
  await expect(reader.locator('#reader-progress')).toHaveText('100%');
});

test('Reader bookmarks, notes and find results preserve the underlying article', async ({
  page,
}) => {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const original = await reader.locator('#reader-prose').textContent();
  await reader.locator('.reader-tools [data-reader-command="bookmark"]').click();
  await expect(reader.locator('#reader-bookmarks .reader-notebook-item')).toHaveCount(1);
  await reader.locator('.reader-tools [data-reader-command="bookmark"]').click();
  await expect(reader.locator('#reader-bookmarks .reader-notebook-item')).toHaveCount(1);
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  await reader.locator('#reader-note-text').fill('Review the article structure.');
  await reader.locator('[data-reader-command="save-note"]').click();
  await expect(reader.locator('#reader-notes')).toContainText('Review the article structure.');
  await reader.locator('.reader-tools [data-reader-command="find"]').click();
  await reader.locator('#reader-query').fill('Astro');
  await reader.locator('#reader-find-form button').click();
  await expect(reader.locator('#reader-find-results li')).not.toHaveCount(0);
  await reader.locator('#reader-find-results button').first().click();
  await expect(reader.locator('#reader-find')).not.toBeVisible();
  expect(await reader.locator('#reader-prose').textContent()).toBe(original);
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' }).click();
  const download = page.waitForEvent('download');
  await reader.locator('[data-reader-command="export-notebook"]').click();
  const notebook = await download;
  expect(notebook.suggestedFilename()).toBe('Reader Notebook.md');
  expect(await readFile((await notebook.path())!, 'utf8')).toContain(
    'Review the article structure.',
  );
});

test('Reader library separates announcements and filters every title', async ({ page }) => {
  await bootDesktop(page, '/blog/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('.reader-book')).toHaveCount(3);
  await expect(reader.locator('.reader-announcement')).toHaveCount(1);
  await expect(reader.locator('.reader-announcements')).toContainText('公告');
  await expect(reader.locator('.reader-announcement a[href="/blog/privacy/"]')).toBeVisible();
  await reader.locator('#library-search').fill('创客聚会');
  await expect(reader.locator('[data-post]:visible')).toHaveCount(1);
  await expect(reader.locator('.reader-announcements')).toBeHidden();
  await reader.locator('#library-search').fill('Privacy');
  await expect(reader.locator('[data-post]:visible')).toHaveCount(1);
  await expect(reader.locator('.reader-announcement')).toBeVisible();
  await choose(reader, 'Library view', 'List');
  await expect(reader.locator('.reader-shelf')).toHaveAttribute('data-library-view', 'list');
  await reader.locator('#library-search').fill('');
  await expect(reader.locator('[data-post]:visible')).toHaveCount(4);
  await expect(reader.locator('.reader-announcements')).toBeVisible();
});

test('Reader saves smooth text and reading width while focus and print preserve readable content', async ({
  page,
}, info) => {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const viewport = reader.locator('#reader-viewport');
  const root = reader.locator('#microsoft-reader');
  await expect(root).toHaveAttribute('data-text-rendering', 'pixel');
  await reader.locator('.reader-tools [data-reader-command="contents"]').click();
  const chapter = reader.locator('#reader-contents a').nth(3);
  await chapter.click();
  const chapterId = await chapter.getAttribute('data-reader-anchor');
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'View' }).click();
  await reader.locator('[data-hybrid-menubar] [data-reader-command="options"]').click();
  await choose(reader, 'Text rendering', 'Smooth font');
  await choose(reader, 'Reading width', 'Narrow');
  await choose(reader, 'Theme', 'Night');
  await reader.locator('[data-reader-command="close-options"]').click();
  await expect(root).toHaveAttribute('data-text-rendering', 'smooth');
  await expect(reader.locator('#reader-flow')).toHaveCSS('font-family', /system-ui/);
  await expect(reader.locator('#reader-contents a[aria-current="location"]')).toHaveAttribute(
    'data-reader-anchor',
    chapterId!,
  );
  await viewport.press('F9');
  await expect(root).toHaveAttribute('data-focus', 'true');
  await expect(reader.locator('.reader-tools')).not.toBeVisible();
  await info.attach('Reader smooth focused reading', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await viewport.press('Escape');
  await expect(root).toHaveAttribute('data-focus', 'false');
  await page.reload();
  await page.locator('#screen').focus();
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-text-rendering', 'smooth');
  await expect(reader.locator('#reader-width')).toHaveValue('narrow');
  await expect(root).toHaveAttribute('data-reading-theme', 'night');
  await page.emulateMedia({ media: 'print' });
  await expect(reader.locator('#reader-flow')).toHaveCSS('column-width', 'auto');
  await expect(viewport).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(viewport).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('Reader JSON backups merge repeated and conflicting notes without losing current annotations', async ({
  page,
}) => {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('.reader-tools [data-reader-command="bookmark"]').click();
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  await reader.locator('#reader-note-text').fill('Original notebook note.');
  await reader.locator('[data-reader-command="save-note"]').click();
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' }).click();
  const pendingDownload = page.waitForEvent('download');
  await reader.locator('[data-reader-command="backup-notebook"]').click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('Reader Notebook.json');
  const backup = await readFile((await download.path())!);
  await reader.locator('#reader-notes [data-reader-action="note-edit"]').click();
  await reader.locator('#reader-note-text').fill('Edited local notebook note.');
  await reader.locator('[data-reader-command="save-note"]').click();
  const imported = { name: 'Reader Notebook.json', mimeType: 'application/json', buffer: backup };
  await reader.locator('#reader-import-file').setInputFiles(imported);
  await expect(reader.locator('#reader-feedback')).toContainText('Imported 0 bookmarks and 1 note');
  await expect(reader.locator('#reader-notes .reader-notebook-item')).toHaveCount(2);
  await expect(reader.locator('#reader-notes')).toContainText('Original notebook note.');
  await expect(reader.locator('#reader-notes')).toContainText('Edited local notebook note.');
  await reader.locator('#reader-import-file').setInputFiles(imported);
  await expect(reader.locator('#reader-feedback')).toContainText('2 duplicates skipped');
  await expect(reader.locator('#reader-notes .reader-notebook-item')).toHaveCount(2);
  await reader.locator('#reader-import-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"other","version":1,"documents":{}}'),
  });
  await expect(reader.locator('#reader-feedback')).toContainText(
    'not a valid MHK10 Reader notebook',
  );
  await expect(reader.locator('#reader-notes .reader-notebook-item')).toHaveCount(2);
  await page.reload();
  await page.locator('#screen').focus();
  await page.keyboard.press('Escape');
  await reader.locator('.reader-tools [data-reader-command="notebook"]').click();
  await expect(reader.locator('#reader-notes .reader-notebook-item')).toHaveCount(2);
  await expect(reader.locator('#reader-bookmarks .reader-notebook-item')).toHaveCount(1);
});

test('Reader highlights actual selected text without editing the article', async ({ page }) => {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const original = await reader.locator('#reader-prose').textContent();
  const paragraph = reader.locator('#reader-prose p').first();
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.dblclick({ position: { x: 12, y: 8 } });
  const highlight = reader.locator('.reader-tools [data-reader-command="highlight"]');
  await expect(highlight).toBeEnabled();
  await highlight.click();
  await expect
    .poll(() =>
      reader
        .locator('#reader-prose')
        .evaluate(() => CSS.highlights.get('reader-annotations')?.size ?? 0),
    )
    .toBe(1);
  expect(await reader.locator('#reader-prose').textContent()).toBe(original);
});

test('Reader opens a desktop text file through the validated file service', async ({ page }) => {
  await bootDesktop(page, '/blog/?file=diary');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('#reader-prose .reader-plain')).toBeVisible();
  await expect(reader.locator('#reader-prose .reader-plain')).not.toBeEmpty();
  await expect(reader.locator('#reader-library')).not.toBeVisible();
});

test('Reader keyboard navigation, progress and search work together without changing the article', async ({
  page,
}, info) => {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  const viewport = reader.locator('#reader-viewport');
  const original = await reader.locator('#reader-prose').textContent();
  await viewport.press('End');
  await expect(reader.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
    'value',
    '100',
  );
  await viewport.press('Control+d');
  await expect(reader.locator('#reader-bookmarks .reader-notebook-item')).toHaveCount(1);
  await reader.getByRole('tab', { name: 'Notebook', exact: true }).press('Home');
  await expect(reader.getByRole('tab', { name: 'Contents', exact: true })).toBeFocused();
  await expect(reader.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
    'value',
    '100',
  );
  await viewport.press('Control+=');
  await expect(reader.locator('#reader-feedback')).toHaveText('Zoom 125%');
  await viewport.press('Control+0');
  await expect(reader.locator('#reader-feedback')).toHaveText('Zoom 100%');
  await viewport.press('Control+f');
  await reader.locator('#reader-query').fill('Astro');
  await reader.locator('#reader-query').press('Enter');
  const matches = await reader.locator('#reader-find-results button').count();
  expect(matches).toBeGreaterThan(0);
  await reader.locator('#reader-find-results button').first().click();
  await expect(reader.locator('#reader-feedback')).toHaveText(`Match 1 of ${matches}`);
  await viewport.press('Shift+F3');
  await expect(reader.locator('#reader-feedback')).toHaveText(`Match ${matches} of ${matches}`);
  await viewport.press('F3');
  await expect(reader.locator('#reader-feedback')).toHaveText(`Match 1 of ${matches}`);
  await viewport.press('Escape');
  await expect(reader.locator('#reader-sidebar')).not.toBeVisible();
  await reader.locator('.reader-tools [data-reader-command="contents"]').click();
  await reader.locator('#reader-contents a').last().click();
  await expect(reader.locator('#reader-contents a[aria-current="location"]')).toHaveCount(1);
  expect(await reader.locator('#reader-prose').textContent()).toBe(original);
  await info.attach('Reader contents and progress', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await viewport.press('Escape');
  await expect(reader.locator('#reader-sidebar')).not.toBeVisible();
  await reader.locator('.reader-library-link').click();
  await choose(reader, 'Sort library', 'Recently opened');
  await expect(reader.locator('.reader-book').first()).toHaveAttribute(
    'data-reader-book',
    'colophon',
  );
});

test('Reader restores a portable view and exposes citation text', async ({ page }) => {
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('.reader-tools [data-reader-command="options"]').click();
  await reader.getByRole('combobox', { name: 'Text rendering', exact: true }).click();
  await reader.getByRole('option', { name: 'Smooth font', exact: true }).click();
  await reader.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(reader.locator('#reader-options')).not.toBeVisible();
  await expect(reader.locator('#microsoft-reader')).toHaveAttribute('data-text-rendering', 'pixel');
  await reader.locator('.reader-tools [data-reader-command="options"]').click();
  await expect(reader.getByRole('combobox', { name: 'Text rendering', exact: true })).toHaveText(
    'Pixel font',
  );
  await reader.locator('[data-reader-command="close-options"]').click();
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' }).click();
  await reader.locator('[data-reader-command="copy-citation"]').click();
  await expect(reader.locator('#reader-feedback')).toHaveText(/Citation copied|Citation text/);
});

test('Reader exports notes when browser persistence is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'doom95.reader.v2')
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await bootDesktop(page, '/blog/colophon/');
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await reader.locator('.reader-tools [data-reader-command="note"]').click();
  await reader.locator('#reader-note-text').fill('Keep this session note in the export.');
  await reader.locator('[data-reader-command="save-note"]').click();
  await expect(reader.locator('#reader-notes')).toContainText('kept in this session');
  await reader.locator('[data-hybrid-menubar] summary').filter({ hasText: 'File' }).click();
  const download = page.waitForEvent('download');
  await reader.locator('[data-reader-command="export-notebook"]').click();
  expect(await readFile((await (await download).path())!, 'utf8')).toContain(
    'Keep this session note in the export.',
  );
});

test('Reader opens saved Markdown as safe structured content with a usable outline', async ({
  page,
}) => {
  const canvas = await openNotepad(page);
  await chooseMenu(page, 'File', 'New');
  await expect(page).toHaveTitle('Untitled.txt - Notepad · MHK10');
  await canvas.focus();
  let characters = 0;
  for (const line of [
    '## Chapter one',
    'A **bold** sentence.',
    '',
    '### Details',
    '<script>alert(1)</script>',
    '',
    '## Chapter two',
    'The end.',
  ]) {
    await page.keyboard.type(line, { delay: 20 });
    await page.keyboard.press('Enter');
    characters += line.length + 1;
    await expect(page.locator('[data-app-status]')).toContainText(`${characters} characters`);
  }
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  await picker.getByLabel('File name', { exact: true }).fill('Reader check.md');
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveTitle('Reader check.md - Notepad · MHK10');
  const fileId = await page.evaluate(() => {
    const saved: { files: { id: string; name: string }[] } = JSON.parse(
      localStorage.getItem('doom95.files.v1')!,
    );
    return saved.files.find((file) => file.name === 'Reader check.md')?.id;
  });
  expect(fileId).toBeTruthy();
  await bootDesktop(page, `/blog/?file=${encodeURIComponent(fileId!)}`);
  const reader = page.frameLocator('iframe[data-html-window="blog"]');
  await expect(reader.locator('#reader-prose strong')).toHaveText('bold');
  await expect(reader.locator('#reader-prose script')).toHaveCount(0);
  await expect(reader.locator('#reader-prose')).toContainText('<script>alert(1)</script>');
  await reader.locator('.reader-tools [data-reader-command="contents"]').click();
  await expect(reader.locator('#reader-contents a')).toHaveCount(3);
  await reader.locator('#reader-contents a').last().click();
  await expect(reader.locator('#reader-contents a').last()).toHaveAttribute(
    'aria-current',
    'location',
  );
  await reader.locator('.reader-library-link').click();
  await reader.locator('#reader-recent summary').click();
  const recent = reader.locator('#reader-recent a').filter({ hasText: 'Reader check.md' });
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(reader.locator('#reader-prose strong')).toHaveText('bold');
});
