import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../../apps/general/src/lib/storage/keys';

test('returning from an article restores the list position and initiating card', async ({
  page,
}) => {
  await page.addInitScript(
    ({ mode, motion }) => {
      localStorage.setItem(mode, 'classic');
      localStorage.setItem(motion, 'reduced');
    },
    { mode: STORAGE_KEYS.displayMode, motion: STORAGE_KEYS.motionLevel },
  );
  await page.goto('/blog/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  const list = page.locator('[data-section-scroll="blog"]');
  await expect(list.locator('[data-scene-ready="true"]').first()).toBeVisible();
  const card = list.locator('[data-article-slug="colophon"]');
  await card.scrollIntoViewIfNeeded();
  const position = await list.evaluate((element) => element.scrollTop);
  await card.click();
  await expect(page).toHaveURL(/\/blog\/colophon\//);
  await page.locator('.article-back').click();
  await expect(page).toHaveURL(/\/blog\/?$/);
  await expect(list.locator('[data-article-slug="colophon"]')).toBeFocused();
  await expect
    .poll(async () => Math.abs((await list.evaluate((element) => element.scrollTop)) - position))
    .toBeLessThan(2);
});
