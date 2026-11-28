import { expect, test } from '@playwright/test';
import { bootDesktop } from './helpers';

test('Home opens the complete Properties record without duplicate site navigation', async ({
  page,
}) => {
  await bootDesktop(page);
  const home = page.frameLocator('iframe[data-html-window="home"]');
  await expect(home.locator('[data-personal-explorer]')).toHaveClass(/explorer-ready/);
  await expect(home.getByRole('heading', { name: 'MiraHikari', exact: true })).toBeVisible();
  await expect(home.locator('[data-folder-items="home"] [data-explorer-item]')).toHaveCount(7);
  await home.locator('[data-explorer-item="about"]').press('Enter');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('.site-navigation')).toBeHidden();
  await profile.getByRole('tab', { name: 'Projects', exact: true }).click();
  await expect(profile.locator('[data-project-id]')).toHaveCount(8);
  await profile.locator('[data-project-select="nearlink-toolbox"]').click();
  await expect(profile.locator('#project-nearlink-toolbox')).toBeVisible();
  await expect(profile.locator('#project-nearlink-toolbox')).toContainText(
    '使用 Rust 和 Tauri 构建跨平台桌面工具',
  );
  await profile.getByRole('tab', { name: 'Honors', exact: true }).click();
  await expect(profile.locator('.honors article')).toHaveCount(7);
  const illustratedHonor = profile
    .locator('.honor-record')
    .filter({ has: page.locator('img[data-original-src]') })
    .first();
  if ((await illustratedHonor.getAttribute('open')) === null)
    await illustratedHonor.locator('summary').click();
  const honorImage = illustratedHonor.locator('img[data-original-src]');
  await honorImage.scrollIntoViewIfNeeded();
  await expect
    .poll(() => honorImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await profile.getByRole('tab', { name: 'Journey', exact: true }).click();
  await expect(profile.locator('.timeline article')).toHaveCount(3);
  await expect(profile.locator('.education article')).toHaveCount(2);
  await expect(profile.locator('.journey li')).toHaveCount(6);
  await profile.getByRole('tab', { name: 'Contact', exact: true }).click();
  await expect(
    profile.getByRole('link', { name: 'mirahikari@example.com', exact: true }),
  ).toHaveAttribute('href', 'mailto:mirahikari@example.com');
  await profile.getByRole('tab', { name: 'Contact', exact: true }).press('Home');
  await expect(profile.getByRole('tab', { name: 'General', exact: true })).toBeFocused();
  await expect(profile.getByRole('tab', { name: 'General', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('Recent projects preview before Open activates the exact Properties record', async ({
  page,
}) => {
  await bootDesktop(page);
  const home = page.frameLocator('iframe[data-html-window="home"]');
  await expect(home.locator('[data-personal-explorer]')).toHaveClass(/explorer-ready/);
  await home.getByRole('treeitem', { name: 'Recent', exact: true }).click();
  await home.locator('[data-folder-items="recent"] [data-explorer-item="project-xengine"]').click();
  await expect(home.locator('[data-preview="project-xengine"]')).toBeVisible();
  await expect(page.locator('iframe[data-html-window="profile"]')).toHaveCount(0);
  await home
    .getByRole('toolbar', { name: 'Home commands' })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.getByRole('tab', { name: 'Projects', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await expect(profile.locator('[data-project-select="xengine"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('technology search covers all categories and restores the reading state', async ({ page }) => {
  await bootDesktop(page, '/skills/');
  const skills = page.frameLocator('iframe[data-html-window="skills"]');
  await expect(skills.locator('.skill-row')).toHaveCount(56);
  await expect(skills.locator('[data-skill-group]')).toHaveCount(8);
  await expect(skills.locator('.learning li')).toHaveCount(5);
  await skills.getByRole('searchbox', { name: 'Find', exact: true }).fill('Rust');
  await expect(skills.locator('#skill-count')).toHaveText('1 match');
  await expect(skills.locator('.skill-row:visible')).toHaveCount(1);
  await expect(skills.locator('.skill-row:visible .node-label')).toHaveText('Rust');
  await expect(skills.locator('#skill-title')).toHaveText('Rust');
  await skills.locator('[data-skill-node="skill:Rust"]').press('Enter');
  await expect(skills.locator('#skill-properties')).toBeVisible();
  await expect(skills.locator('#skill-property-values')).toContainText('系统级编程');
  await skills.getByRole('button', { name: 'Close technology properties', exact: true }).click();
  await skills.getByRole('searchbox').fill('no-such-technology');
  await expect(skills.locator('#skill-count')).toHaveText('0 matches');
  await expect(skills.locator('[data-skill-group]:visible')).toHaveCount(0);
  await skills.getByRole('searchbox').fill('');
  await expect(skills.locator('#skill-count')).toHaveText('56 technologies · 8 categories');
  await expect(skills.locator('.skill-category[aria-expanded="true"]')).toHaveCount(1);
  await expect(skills.locator('.skill-row[aria-selected="true"] .node-label')).toHaveText(
    'TypeScript',
  );
  await skills.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(skills.locator('.skill-row:visible')).toHaveCount(56);
});

test('Currently Learning stays inside the dialog and keeps its action available', async ({
  page,
}, info) => {
  await bootDesktop(page, '/skills/');
  const skills = page.frameLocator('iframe[data-html-window="skills"]');
  await skills
    .getByRole('toolbar', { name: 'Technology tools' })
    .getByRole('button', { name: 'Learning', exact: true })
    .click();
  const dialog = skills.getByRole('dialog', { name: 'Currently Learning' });
  await expect(dialog).toBeVisible();
  const overflow = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>('.hybrid-dialog-content');
    return {
      dialog: element.scrollWidth - element.clientWidth,
      content: content ? content.scrollWidth - content.clientWidth : 0,
    };
  });
  expect(overflow.dialog).toBeLessThanOrEqual(1);
  expect(overflow.content).toBeLessThanOrEqual(1);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  const ok = dialog.getByRole('button', { name: 'OK', exact: true });
  await expect(ok).toBeVisible();
  await info.attach('Currently Learning dialog', {
    body: await dialog.screenshot(),
    contentType: 'image/png',
  });
  await ok.click();
  await expect(dialog).not.toBeVisible();
});

test('the complete album filters photos and opens its shared image browser', async ({ page }) => {
  await bootDesktop(page, '/gallery/');
  const gallery = page.frameLocator('iframe[data-html-window="gallery"]');
  await expect(gallery.locator('.gallery-card')).toHaveCount(31);
  await expect(
    gallery.locator('.gallery-image img[data-original-src^="/images/gallery/"]'),
  ).toHaveCount(31);
  await gallery.getByRole('combobox', { name: 'Filter by collection' }).click();
  await gallery.getByRole('option', { name: 'AdventureX', exact: true }).click();
  const count = await gallery.locator('.gallery-card:visible').count();
  expect(count).toBeGreaterThan(1);
  await expect(gallery.locator('#gallery-count')).toHaveText(`${count} images`);
  const first = gallery.locator('.gallery-card:visible .gallery-image').first();
  await expect(first).toHaveAttribute('href', /\/acdsee\/\?media=/);
  await first.click();
  const viewer = page.frameLocator('iframe[data-html-window="acdsee"]');
  await expect(viewer.locator('#image-view')).toBeVisible();
  await expect
    .poll(() =>
      viewer.locator('#image-view').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(viewer.locator('#image-original')).toHaveAttribute('href', /\/images\/gallery\//);
});
