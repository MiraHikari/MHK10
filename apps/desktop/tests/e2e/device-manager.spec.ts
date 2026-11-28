import { expect, test, type Page } from '@playwright/test';
import shared from '@mhk/site-core/content/profile.json' with { type: 'json' };

async function openCompactManager(page: Page, width = 300, height = 260) {
  await page.route('**/__device-client-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0"><iframe title="Device Manager" src="/skills/" style="width:${width}px;height:${height}px;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto('/__device-client-test');
  const skills = page.frameLocator('iframe');
  await expect(skills.locator('#skill-manager')).toHaveClass(/skill-ready/);
  return skills;
}

test('a compact Device Manager keeps selection details accessible and restores the tree', async ({
  page,
}, info) => {
  const skills = await openCompactManager(page);
  const javascript = skills.getByRole('treeitem', { name: 'JavaScript', exact: true });
  await javascript.click();
  const toggle = skills.locator('[data-skill-command="details"]');
  await toggle.click();
  await expect(toggle).toHaveText('Tree');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(skills.locator('#skill-preview')).toBeVisible();
  await expect(skills.locator('#skill-title')).toHaveText('JavaScript');
  await expect(skills.locator('#skill-summary')).toContainText('5 years');
  await expect(skills.getByRole('tree', { name: 'Technologies' })).toBeHidden();
  expect(
    await skills
      .locator('#skill-manager')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.locator('iframe').screenshot({ path: info.outputPath('device-compact-details.png') });
  await toggle.click();
  await expect(javascript).toBeVisible();
  await expect(javascript).toHaveAttribute('aria-selected', 'true');
  await javascript.press('Enter');
  await expect(skills.getByRole('dialog', { name: 'Technology Properties' })).toBeVisible();
  await skills.getByRole('button', { name: 'Close technology properties' }).click();
  await expect(javascript).toBeFocused();
});

test('an empty search remains actionable in compact view and clears to the previous selection', async ({
  page,
}, info) => {
  const skills = await openCompactManager(page);
  const javascript = skills.getByRole('treeitem', { name: 'JavaScript', exact: true });
  await javascript.click();
  await skills.locator('[data-skill-command="details"]').click();
  const search = skills.getByRole('searchbox', { name: 'Find' });
  await search.fill('no-such-technology');
  await expect(skills.locator('#skill-empty')).toBeVisible();
  await expect(skills.locator('#skill-count')).toHaveText('0 matches');
  await expect(skills.getByRole('button', { name: 'Details', exact: true })).toBeDisabled();
  await expect(skills.getByRole('button', { name: 'Properties', exact: true })).toBeDisabled();
  await page.locator('iframe').screenshot({ path: info.outputPath('device-compact-empty.png') });
  await skills.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(javascript).toHaveAttribute('aria-selected', 'true');
  await expect(skills.locator('#skill-empty')).toBeHidden();
  await search.fill('Rust');
  await expect(skills.getByRole('treeitem', { name: 'Rust', exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(javascript).toHaveAttribute('aria-selected', 'true');
  await expect(skills.locator('[data-skill-node="group:DESKTOP"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('Find returns to visible results and category Enter follows the tree selection', async ({
  page,
}) => {
  const skills = await openCompactManager(page);
  const search = skills.getByRole('searchbox', { name: 'Find' });
  const javascript = skills.getByRole('treeitem', { name: 'JavaScript', exact: true });
  await javascript.click();
  await skills.locator('[data-skill-command="details"]').click();
  await search.fill('Rust');
  const rust = skills.getByRole('treeitem', { name: 'Rust', exact: true });
  await expect(rust).toBeVisible();
  await expect(skills.locator('#skill-tree-title')).toHaveText('Results for “Rust”');
  await expect(skills.locator('#skill-count')).toHaveText('1 match');
  await search.press('ArrowDown');
  await expect(rust).toBeFocused();
  await rust.press('ArrowLeft');
  const systems = skills.locator('[data-skill-node="group:DESKTOP"]');
  await expect(systems).toBeFocused();
  await systems.press('Enter');
  await expect(systems).toHaveAttribute('aria-expanded', 'false');
  await expect(rust).toBeHidden();
  await systems.press('Enter');
  await expect(systems).toHaveAttribute('aria-expanded', 'true');
  await systems.press('ArrowRight');
  await expect(rust).toBeFocused();
  await rust.press('Control+f');
  await expect(search).toBeFocused();
  await page.keyboard.type('TypeScript');
  await expect(search).toHaveValue('TypeScript');
  await search.press('Enter');
  const typescript = skills.getByRole('treeitem', { name: 'TypeScript', exact: true });
  await expect(typescript).toBeFocused();
  await typescript.press('Enter');
  const properties = skills.getByRole('dialog', { name: 'Technology Properties' });
  await expect(properties).toBeVisible();
  await skills.getByRole('button', { name: 'Close technology properties' }).press('F1');
  await expect(skills.getByRole('dialog', { name: 'Device Manager Help' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(properties).toBeHidden();
  await expect(typescript).toBeFocused();
  await typescript.press('Control+f');
  await search.press('Escape');
  await search.press('Enter');
  await expect(javascript).toBeFocused();
  await expect(systems).toHaveAttribute('aria-expanded', 'false');
});

test('the minimum desktop client keeps tools, filtering and selected rows inside the viewport', async ({
  page,
}, info) => {
  const skills = await openCompactManager(page, 274, 155);
  const search = skills.getByRole('searchbox', { name: 'Find' });
  await search.fill('no-such-technology');
  const clear = skills.getByRole('button', { name: 'Clear search', exact: true });
  await expect(clear).toBeInViewport();
  await expect(skills.locator('#skill-count')).toBeInViewport();
  expect(
    await skills.locator('#skill-manager').evaluate((element) => ({
      overflowX: element.scrollWidth > element.clientWidth,
      overflowY: document.documentElement.scrollHeight > window.innerHeight,
    })),
  ).toEqual({ overflowX: false, overflowY: false });
  await page.locator('iframe').screenshot({ path: info.outputPath('device-minimum-empty.png') });
  await clear.click();
  await search.press('Enter');
  const typescript = skills.getByRole('treeitem', { name: 'TypeScript', exact: true });
  await expect(typescript).toBeFocused();
  await typescript.press('End');
  const last = skills.locator('[role="treeitem"][aria-selected="true"]');
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(skills.getByRole('toolbar', { name: 'Technology tools' })).toBeInViewport();
  await page.locator('iframe').screenshot({ path: info.outputPath('device-minimum-tree.png') });
});

test('the public skills route exposes every technology and its notes without JavaScript', async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error('A site URL is required');
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 900, height: 700 },
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL('/skills/', baseURL).href);
    await expect(page.getByRole('navigation', { name: 'Personal site navigation' })).toBeVisible();
    const catalog = page.getByRole('region', { name: 'Technology catalog' });
    await expect(catalog.locator('.skill-reference-record')).toHaveCount(shared.skills.length);
    await expect(page.getByRole('toolbar', { name: 'Technology tools' })).toBeHidden();
    const rust = catalog.locator('.skill-reference-record').filter({
      has: page.locator('summary').filter({ hasText: /^Rust$/ }),
    });
    await rust.locator('summary').click();
    await expect(rust).toHaveAttribute('open', '');
    await expect(rust.locator('p')).toHaveText(
      shared.skills.find((skill) => skill.name === 'Rust')!.note,
    );
    await expect(rust.locator('dl')).toContainText('Experience');
    await page.screenshot({ path: info.outputPath('device-public-reference.png') });
  } finally {
    await context.close();
  }
});
