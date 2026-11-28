import { expect, test, type Page, type Frame } from '@playwright/test';
import { FUSION_DESKTOP_ORIGIN as DESKTOP_ORIGIN } from '../../scripts/verify-config.mjs';
const IMAGE = '/images/gallery/journey-industry-display.webp';

async function boot(page: Page) {
  await expect(page.locator('#boot-loader')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('[data-mode-toggle]')).toBeVisible();
}

async function switchMode(page: Page, mode: 'classic' | 'win95') {
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-display-mode', mode, {
    timeout: 30_000,
  });
  if (mode === 'classic')
    await expect(page.locator('[data-classic-root]')).toHaveCSS('filter', 'none');
}

async function childApplication(page: Page, pathname: string): Promise<Frame> {
  const match = () =>
    page
      .frames()
      .find(
        (frame) =>
          frame.parentFrame()?.parentFrame() === page.mainFrame() &&
          frame.url().startsWith(`${DESKTOP_ORIGIN}${pathname}`),
      );
  await expect.poll(() => Boolean(match()), { timeout: 30_000 }).toBe(true);
  const frame = match();
  if (!frame) throw new Error(`Missing application at ${pathname}`);
  return frame;
}

test('cold project link focuses the original ID and returns from the desktop', async ({ page }) => {
  await page.goto('/projects/?item=nearlink-toolbox');
  await boot(page);
  await expect(page.locator('[data-command-target="nearlink-toolbox"]').first()).toHaveClass(
    /command-target-highlight/,
  );
  await expect(page).toHaveURL(/item=nearlink-toolbox/);
  await switchMode(page, 'win95');
  const profile = await childApplication(page, '/about/');
  await expect.poll(() => profile.url()).toMatch(/#project-nearlink-toolbox$/);
  await expect(profile.locator('[data-project-id="nearlink-toolbox"]')).toBeVisible();
  await switchMode(page, 'classic');
  await expect(page).toHaveURL(/\/projects\/?\?item=nearlink-toolbox$/);
  expect(page.frames().every((frame) => !frame.url().includes('project-project-'))).toBe(true);
  await page.screenshot({ path: test.info().outputPath('project-target.png') });
});

for (const skill of ['C++', 'TanStack Query']) {
  test(`cold skill link keeps ${skill} intact in both presentations`, async ({ page }) => {
    await page.goto(`/skills/?item=${encodeURIComponent(skill)}`);
    await boot(page);
    const target = page.locator(`[data-command-target="${skill}"]`);
    await expect(target).toHaveAttribute('data-command-target', skill);
    await expect(target).toHaveClass(/command-target-highlight/);
    await switchMode(page, 'win95');
    const skills = await childApplication(page, '/skills/');
    await expect(
      skills.locator('[data-skill-name]').filter({ hasText: skill }).first(),
    ).toHaveAttribute('aria-selected', 'true');
    await switchMode(page, 'classic');
    await expect(page).toHaveURL(
      new RegExp(`item=${encodeURIComponent(skill).replace(/\+/g, '\\+')}$`),
    );
    expect(page.frames().every((frame) => !frame.url().includes('skill-skill-'))).toBe(true);
  });
}

test('gallery target selects its category and opens the same desktop image', async ({ page }) => {
  await page.goto(`/gallery/?item=${encodeURIComponent(IMAGE)}`);
  await boot(page);
  await expect(page.locator(`[data-command-target="${IMAGE}"]`)).toHaveClass(
    /command-target-highlight/,
  );
  await expect(page.getByRole('button', { name: 'SCENERY', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await switchMode(page, 'win95');
  const image = await childApplication(page, '/acdsee/');
  await expect(image.locator('#image-title')).toHaveText('路途 · 窗外的工业');
  await switchMode(page, 'classic');
  await expect(page).toHaveURL(/\/gallery\/?\?item=/);
  await expect(page.locator(`[data-command-target="${IMAGE}"]`)).toBeVisible();
  await expect(page.locator('.section-scroll[aria-hidden="false"]')).toHaveCSS(
    'filter',
    'blur(0px)',
  );
  await page.screenshot({ path: test.info().outputPath('gallery-target.png') });
});

test('friends maps to the desktop Contact tab and returns to friends', async ({ page }) => {
  await page.goto('/friends/');
  await boot(page);
  await switchMode(page, 'win95');
  const profile = await childApplication(page, '/about/');
  await expect.poll(() => profile.url()).toMatch(/#friends$/);
  await expect(profile.locator('#contact-tab')).toHaveAttribute('aria-selected', 'true');
  await switchMode(page, 'classic');
  await expect(page).toHaveURL(/\/friends\/$/);
});

test('history restores item targets on the same section', async ({ page }) => {
  await page.goto('/skills/?item=C%2B%2B');
  await boot(page);
  await page.evaluate(() => {
    window.history.pushState(null, '', '/skills/?item=TanStack%20Query');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('[data-command-target="TanStack Query"]')).toHaveClass(
    /command-target-highlight/,
  );
  await page.goBack();
  await expect(page.locator('[data-command-target="C++"]')).toHaveClass(/command-target-highlight/);
});
