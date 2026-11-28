import { expect, test } from '@playwright/test';
import { STORAGE_KEYS } from '../../apps/general/src/lib/storage/keys';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'reduced'), STORAGE_KEYS.motionLevel);
});

for (const width of [1440, 1024]) {
  test(`the ${width}px recommendation stays visible and keyboard accessible`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#boot-loader')).toBeHidden();
    const offer = page.getByRole('complementary', { name: 'MHK10 桌面推荐' });
    await expect(offer).toBeVisible();
    await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
    await expect(offer).toContainText('640×360');
    await expect(offer).toContainText('16 色');
    const enter = offer.getByRole('button', { name: '进入桌面' });
    const stay = offer.getByRole('button', { name: '留在通用版' });
    const enterBox = await enter.boundingBox();
    const stayBox = await stay.boundingBox();
    expect(enterBox?.height).toBeGreaterThanOrEqual(44);
    expect(stayBox?.height).toBeGreaterThanOrEqual(44);
    const bounds = await offer.boundingBox();
    if (!bounds) throw new Error('The desktop recommendation has no visible bounds');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
    await enter.focus();
    await expect(enter).toBeFocused();
    await page.screenshot({ path: info.outputPath(`desktop-offer-${width}.png`) });
    await enter.press('Tab');
    await expect(stay).toBeFocused();
    await stay.press('Enter');
    await expect(offer).toBeHidden();
    await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
  });
}

test('the recommendation follows the active accent without loading the desktop', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  const offer = page.getByRole('complementary', { name: 'MHK10 桌面推荐' });
  await expect(offer).toBeVisible();
  const enter = offer.getByRole('button', { name: '进入桌面' });
  const original = await enter.evaluate((button) => getComputedStyle(button).backgroundColor);
  // The chapter/Lucid owner publishes these same CSS variables in production.
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--section-accent', '#0e7490');
    root.style.setProperty('--section-accent-soft', '#3fb6ce');
    root.style.setProperty('--section-accent-ink', '#3fb6ce');
    root.style.setProperty('--section-accent-on', '#ffffff');
  });
  await expect
    .poll(() => enter.evaluate((button) => getComputedStyle(button).backgroundColor))
    .not.toBe(original);
  await page.screenshot({ path: info.outputPath('desktop-offer-accent.png') });
  await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
});

test('Save-Data keeps a one-line hint and does not download the desktop', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true, effectiveType: '4g' },
      configurable: true,
    });
  });
  await page.goto('/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  await expect(page.locator('.about-entry__offer')).toHaveCount(0);
  const hint = page.locator('.about-entry__hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('MHK10 像素桌面');
  await page.screenshot({ path: info.outputPath('desktop-offer-save-data.png') });
  await hint.getByRole('button', { name: '知道了' }).click();
  await expect(hint).toBeHidden();
  await expect(page.locator('[data-desk-embed] iframe')).toHaveCount(0);
});

test('returning after the edge switch keeps an answered recommendation closed', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#boot-loader')).toBeHidden();
  await expect(page.locator('.about-entry__offer')).toBeVisible();
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'win95');
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', 'classic');
  await expect(page.locator('.about-entry__offer')).toHaveCount(0);
});
