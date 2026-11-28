import { readFile } from 'node:fs/promises';
import { expect, test, type FrameLocator } from '@playwright/test';
import shared from '@mhk/site-core/content/profile.json' with { type: 'json' };
import { bootDesktop } from './helpers';

async function choose(frame: FrameLocator, name: string, option: string) {
  await frame.getByRole('combobox', { name, exact: true }).and(frame.locator('button')).click();
  await frame.getByRole('option', { name: option, exact: true }).click();
}

test('project filters preserve authored records and navigate the visible ordered results', async ({
  page,
}, info) => {
  await bootDesktop(page, '/about/#projects');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
  await profile.getByRole('tab', { name: 'Projects', exact: true }).click();
  const query = profile.getByRole('searchbox', { name: 'Find projects', exact: true });
  const choices = profile.locator('[data-project-select]:visible');
  await query.fill('Ｒｕｓｔ  Ｔａｕｒｉ');
  await expect(query).toHaveValue('Ｒｕｓｔ  Ｔａｕｒｉ');
  await expect(choices).toHaveCount(1);
  await expect(profile.locator('#project-nearlink-toolbox')).toBeVisible();
  await expect(profile.locator('[data-project-id]')).toHaveCount(8);
  await query.fill('');
  await choose(profile, 'Project technology', 'UNIHIKER');
  await expect(choices).toHaveCount(2);
  await choose(profile, 'Project order', 'Newest first');
  await expect(choices.first()).toHaveAttribute('data-project-select', 'xunxing');
  await choices.first().press('Home');
  await expect(profile.locator('#project-xunxing')).toBeVisible();
  await choices.first().press('ArrowDown');
  await expect(profile.locator('#project-daka')).toBeVisible();
  await expect(profile.locator('[data-project-select="daka"]')).toBeFocused();
  await info.attach('Filtered project archive', {
    body: await page.screenshot({ path: info.outputPath('project-archive.png') }),
    contentType: 'image/png',
  });
  await query.fill('no matching project');
  await expect(choices).toHaveCount(0);
  await expect(profile.locator('[data-project-empty]')).toBeVisible();
  await expect(profile.locator('[data-properties-status]')).toHaveText('No matching projects');
  await profile.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(query).toBeFocused();
  await expect(choices).toHaveCount(8);
  await expect(profile.getByRole('combobox', { name: 'Project technology' })).toHaveText(
    'All technologies',
  );
  await expect(profile.getByRole('combobox', { name: 'Project order' })).toHaveText('Newest first');
  await expect(choices.first()).toHaveAttribute('data-project-select', 'xengine');
  const overflow = await profile
    .locator('[data-project-tools]')
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('profile guides reveal exact projects and history keeps the chosen record', async ({
  page,
}, info) => {
  await bootDesktop(page, '/about/');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await expect(profile.locator('[data-personal-properties]')).toHaveClass(/properties-ready/);
  await expect(profile.locator('[data-profile-guide]')).toHaveCount(3);
  await profile.locator('[data-project-jump="cloudflare-vmail"]').press('Enter');
  await expect(profile.locator('#project-cloudflare-vmail')).toBeVisible();
  const selected = profile.locator('[data-project-select="cloudflare-vmail"]');
  await expect(selected).toBeFocused();
  await selected.press('ArrowDown');
  await expect(profile.locator('#project-riddle-town-hunt')).toBeVisible();
  await profile.getByRole('searchbox', { name: 'Find projects' }).fill('missing');
  await profile.getByRole('tab', { name: 'General', exact: true }).click();
  await profile.locator('[data-project-jump="xengine"]').click();
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await expect(profile.getByRole('searchbox', { name: 'Find projects' })).toHaveValue('');
  await expect(profile.locator('[data-project-select]:visible')).toHaveCount(8);
  // A Properties history entry belongs to its iframe, not a top-level page load.
  await profile
    .locator('[data-personal-properties]')
    .evaluate((element) => element.ownerDocument.defaultView?.history.back());
  await expect(profile.getByRole('tab', { name: 'General', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await profile
    .locator('[data-personal-properties]')
    .evaluate((element) => element.ownerDocument.defaultView?.history.forward());
  await expect(profile.locator('#project-xengine')).toBeVisible();
  await profile.getByRole('tab', { name: 'Honors', exact: true }).click();
  await expect(profile.locator('.profile-certificates')).toContainText('ECCP - 高级云架构工程师');
  await expect(profile.locator('.profile-certificates article')).toHaveCount(1);
  await profile.getByRole('tab', { name: 'General', exact: true }).click();
  await profile.locator('[data-profile-guide="web"]').scrollIntoViewIfNeeded();
  await info.attach('Personal work guide', {
    body: await page.screenshot({ path: info.outputPath('personal-work-guide.png') }),
    contentType: 'image/png',
  });
});

test('contact details remain portable when clipboard access is unavailable', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
    });
  });
  await bootDesktop(page, '/about/#contact');
  const profile = page.frameLocator('iframe[data-html-window="profile"]');
  await profile.getByRole('tab', { name: 'Contact', exact: true }).click();
  await profile.getByRole('button', { name: 'Copy email', exact: true }).click();
  const address = profile.getByRole('textbox', { name: 'Email address to copy' });
  await expect(address).toHaveValue(shared.profile.email);
  await expect(address).toBeFocused();
  expect(
    await address.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, shared.profile.email.length]);
  await expect(profile.locator('[data-contact-feedback]')).toContainText('Address selected');
  const download = page.waitForEvent('download');
  await profile.getByRole('link', { name: 'Save contact card', exact: true }).click();
  const card = await download;
  expect(card.suggestedFilename()).toBe('MiraHikari.vcf');
  const content = (await readFile((await card.path())!, 'utf8')).replace(/\r\n[ \t]/g, '');
  expect(content).toContain('BEGIN:VCARD\r\nVERSION:3.0\r\n');
  expect(content).toContain('FN:MiraHikari\r\n');
  expect(content).toContain(`EMAIL;TYPE=INTERNET:${shared.profile.email}\r\n`);
  expect(content).toContain(`URL:${shared.profile.github}\r\n`);
  expect(content).toContain(`ADR:;;;${shared.profile.location};;;\r\n`);
  await info.attach('Portable contact card', {
    body: await page.screenshot({ path: info.outputPath('contact-card.png') }),
    contentType: 'image/png',
  });
});

test('profile guides, project records and the contact card work without client scripts', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/about/');
    await expect(page.locator('[data-profile-guide]')).toHaveCount(3);
    await expect(page.locator('[data-project-id]:visible')).toHaveCount(8);
    await expect(page.locator('[data-project-tools]')).toBeHidden();
    await page.locator('[data-project-jump="nearlink-toolbox"]').click();
    await expect(page).toHaveURL(/\/about\/#project-nearlink-toolbox$/);
    await expect(page.locator('#project-nearlink-toolbox')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save contact card' })).toHaveAttribute(
      'href',
      '/mirahikari.vcf',
    );
    const card = await page.request.get('/mirahikari.vcf');
    expect(card.ok()).toBe(true);
    expect(await card.text()).toContain('FN:MiraHikari');
  } finally {
    await context.close();
  }
});

test('the minimum Properties client keeps filters and project details reachable', async ({
  page,
}, info) => {
  await page.route('**/__small-profile-client', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:8px"><iframe title="Small Properties" src="/about/#projects" style="width:274px;height:155px;border:0"></iframe></body></html>',
    }),
  );
  await page.goto('/__small-profile-client');
  const profile = page.frameLocator('iframe');
  const root = profile.locator('[data-personal-properties]');
  await expect(root).toHaveClass(/properties-ready/);
  await profile.getByRole('searchbox', { name: 'Find projects' }).fill('Rust Tauri');
  await expect(profile.locator('[data-project-select]:visible')).toHaveCount(1);
  const heading = profile.locator('#project-nearlink-toolbox h3');
  await heading.scrollIntoViewIfNeeded();
  const geometry = await heading.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const root = element.closest('[data-personal-properties]')!.getBoundingClientRect();
    const work = element.closest('.project-records')!.getBoundingClientRect();
    return { intersects: box.top < root.bottom && box.bottom > root.top, height: work.height };
  });
  expect(geometry.intersects).toBe(true);
  expect(geometry.height).toBeGreaterThan(0);
  await info.attach('Minimum Properties window', {
    body: await page.screenshot({ path: info.outputPath('minimum-properties.png') }),
    contentType: 'image/png',
  });
  await profile.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(profile.getByRole('searchbox', { name: 'Find projects' })).toBeFocused();
  await expect(profile.locator('[data-project-select]:visible')).toHaveCount(8);
  expect(
    await root.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
});
