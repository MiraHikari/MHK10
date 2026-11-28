import { expect, test, type FrameLocator } from '@playwright/test';
import { bootDesktop } from './helpers';
async function checkTiles(viewer: FrameLocator) {
  await expect(viewer.locator('#image-browser')).toHaveAttribute('aria-busy', 'false');
  await viewer.locator('[data-folder="Projects"]').click();
  await expect(viewer.locator('#image-list [role="option"]')).toHaveCount(8);
  const invalid = await viewer.locator('#image-list [role="option"]').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const tile = element.getBoundingClientRect();
      const image = element.querySelector('img')!.getBoundingClientRect();
      const caption = element.querySelector('span')!.getBoundingClientRect();
      return tile.height < 96 ||
        image.left < tile.left ||
        image.right > tile.right ||
        image.bottom > tile.bottom ||
        caption.bottom > tile.bottom + 1
        ? [element.textContent]
        : [];
    }),
  );
  expect(invalid).toEqual([]);
  expect(
    await viewer
      .locator('#image-list')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
}

test('ACDSee thumbnails stay inside their cells in the actual desktop window', async ({ page }) => {
  await bootDesktop(page, '/acdsee/');
  await checkTiles(page.frameLocator('iframe[data-html-window="acdsee"]'));
});

test('ACDSee thumbnails and controls fit a 360 px client', async ({ page }) => {
  await page.route('**/__image-client-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:0"><iframe title="Image client" src="/acdsee/" style="width:360px;height:300px;border:0"></iframe></body></html>',
    }),
  );
  await page.goto('/__image-client-test');
  const viewer = page.frameLocator('iframe');
  await expect(viewer.locator('#image-position')).not.toBeEmpty();
  await checkTiles(viewer);
  expect(
    await viewer
      .locator('#image-browser')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test('Device Manager keyboard navigation follows tree semantics and properties states', async ({
  page,
}) => {
  await bootDesktop(page, '/skills/');
  const skills = page.frameLocator('iframe[data-html-window="skills"]');
  await expect(skills.locator('#skill-manager')).toHaveClass(/skill-ready/);
  const core = skills.locator('[data-skill-node="group:LANGUAGES"]');
  const typescript = skills.locator('[data-skill-node="skill:TypeScript"]');
  await typescript.click();
  await typescript.press('ArrowUp');
  await expect(core).toBeFocused();
  await expect(skills.getByRole('button', { name: 'Properties', exact: true })).toBeDisabled();
  await core.press('ArrowLeft');
  await expect(core).toHaveAttribute('aria-expanded', 'false');
  await expect(typescript).not.toBeVisible();
  await core.press('ArrowRight');
  await expect(core).toHaveAttribute('aria-expanded', 'true');
  await core.press('ArrowRight');
  await expect(typescript).toBeFocused();
  await typescript.press('ArrowDown');
  await expect(skills.locator('[data-skill-node="skill:JavaScript"]')).toBeFocused();
  await expect(skills.locator('#skill-title')).toHaveText('JavaScript');
  await skills.locator('[data-skill-node="skill:JavaScript"]').press('Enter');
  await expect(skills.locator('#skill-properties')).toBeVisible();
  await expect(skills.locator('#skill-property-values')).toContainText('5 years');
  await skills.getByRole('button', { name: 'Close technology properties', exact: true }).click();
});
