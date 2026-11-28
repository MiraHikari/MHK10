import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PAT_KEY = 'mirahikari-portfolio:admin:cred:gh-pat';
const BLOG_PATH = 'packages/site-core/content/blog/test-post.md';
const PROJECT_PATH = 'packages/site-core/content/projects/test-project.md';
const PROFILE_PATH = 'packages/site-core/content/profile.json';
const BLOG =
  '---\ntitle: Test article\ndescription: Test description\npublishDate: 2026-10-01\ntags: [test]\ndraft: true\n---\n\nOriginal article body\n';
const PROJECT =
  '---\ntitle: Test project\ndescription: Test description\ntags: [test]\ndate: "2026"\nfeatured: false\norder: 1\n---\n\nOriginal project body\n';
const PROFILE = readFileSync(
  new URL('../../packages/site-core/content/profile.json', import.meta.url),
  'utf8',
);

/** Every GitHub request is handled here; mutations never leave the browser. */
async function repository(page: Page) {
  let head = 'editor-head';
  let nextBlob: { entered(): void; release: Promise<void> } | undefined;
  let nextHead: { entered(): void; release: Promise<void> } | undefined;
  const blobs: string[] = [];
  const writes: string[] = [];
  await page.addInitScript((key) => localStorage.setItem(key, 'mock-token'), PAT_KEY);
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const path = decodeURIComponent(new URL(request.url()).pathname);
    const method = request.method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (method === 'GET' && path.endsWith('/git/ref/heads/main')) {
      if (nextHead) {
        const paused = nextHead;
        nextHead = undefined;
        paused.entered();
        await paused.release;
        return json({ message: 'Mock save failure' }, 500);
      }
      return json({ object: { sha: head } });
    }
    if (method === 'GET' && path.includes('/git/trees/'))
      return json({
        tree: [BLOG_PATH, PROJECT_PATH].map((entry) => ({ path: entry, type: 'blob' })),
        truncated: false,
      });
    if (method === 'GET' && path.includes('/contents/')) {
      const file = path.split('/contents/')[1];
      const content =
        file === BLOG_PATH
          ? BLOG
          : file === PROJECT_PATH
            ? PROJECT
            : file === PROFILE_PATH
              ? PROFILE
              : undefined;
      if (content === undefined) throw new Error(`Unexpected mock content read: ${file}`);
      expect(new URL(request.url()).searchParams.get('ref')).toBe('editor-head');
      return route.fulfill({ status: 200, contentType: 'text/plain', body: content });
    }
    if (method === 'POST' && path.endsWith('/git/blobs')) {
      const data: unknown = request.postDataJSON();
      if (
        !data ||
        typeof data !== 'object' ||
        !('content' in data) ||
        typeof data.content !== 'string'
      )
        throw new Error('Missing authored save content');
      blobs.push(data.content);
      if (nextBlob) {
        const paused = nextBlob;
        nextBlob = undefined;
        paused.entered();
        await paused.release;
        return json({ message: 'Mock save failure' }, 500);
      }
      return json({ sha: 'mock-blob' });
    }
    writes.push(`${method} ${path}`);
    return json({ message: `Unexpected mock mutation: ${method} ${path}` }, 500);
  });
  const pause = (kind: 'blob' | 'head') => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = {
      entered,
      release: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    if (kind === 'blob') nextBlob = paused;
    else nextHead = paused;
    return { started, release };
  };
  return {
    blobs,
    writes,
    pause,
    changeHead: () => {
      head = 'concurrent-head';
    },
  };
}

async function admin(page: Page) {
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: '新建文章', exact: true })).toBeVisible();
  await expect(page.getByText('Test article', { exact: true })).toBeVisible();
}

for (const [panel, title, body] of [
  ['博客', 'Test article', 'Original article body'],
  ['项目', 'Test project', 'Original project body'],
] as const) {
  test(`${panel} save locks accepted input and preserves its draft on failure`, async ({
    page,
  }) => {
    const repo = await repository(page);
    await admin(page);
    if (panel === '项目')
      await page.locator('aside').getByRole('button', { name: panel, exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '编辑', exact: true }).first().click();
    const titleInput = page.locator('#schema-title');
    const markdown = page.locator('.markdown-field textarea');
    await titleInput.fill('Accepted title');
    await markdown.fill(`${body}\nAccepted body`);
    const pending = repo.pause('blob');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await pending.started;
    await expect(
      page.locator('aside').getByRole('button', { name: '项目', exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeDisabled();
    await expect(titleInput).toBeDisabled();
    await expect(markdown).toBeDisabled();
    await expect(page.getByRole('button', { name: '返回', exact: true })).toBeDisabled();
    expect(repo.blobs[0]).toContain('Accepted title');
    expect(repo.blobs[0]).toContain('Accepted body');
    pending.release();
    await expect(titleInput).toBeEnabled();
    await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeEnabled();
    await expect(titleInput).toHaveValue('Accepted title');
    await expect(markdown).toHaveValue(`${body}\nAccepted body`);
    await expect(page.getByRole('alert')).toContainText('GitHub 服务暂时不可用');
    expect(repo.writes).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`admin-${panel}-failed-save.png`) });
  });
}

test('profile save locks section switching and retains accepted values after failure', async ({
  page,
}) => {
  const repo = await repository(page);
  await admin(page);
  await page.locator('aside').getByRole('button', { name: '资料', exact: true }).click();
  const birthday = page.locator('#schema-birthday');
  await expect(birthday).toBeVisible();
  await birthday.fill('2004-01-02');
  const pending = repo.pause('blob');
  await page.getByRole('button', { name: '保存本节', exact: true }).click();
  await pending.started;
  await expect(birthday).toBeDisabled();
  await expect(page.getByRole('button', { name: '个人资料', exact: true }).last()).toBeDisabled();
  expect(JSON.parse(repo.blobs[0]).birthday).toBe('2004-01-02');
  pending.release();
  await expect(birthday).toBeEnabled();
  await expect(birthday).toHaveValue('2004-01-02');
  expect(repo.writes).toEqual([]);
});

test('gallery save locks its form, return and cancel and retains the failed draft', async ({
  page,
}) => {
  const repo = await repository(page);
  await admin(page);
  await page.locator('aside').getByRole('button', { name: '图库', exact: true }).click();
  await page.getByRole('button', { name: /路途 · 窗外的工业/ }).click();
  const title = page.locator('#schema-title');
  await title.fill('Accepted gallery title');
  const pending = repo.pause('blob');
  await page.getByRole('button', { name: '保存条目', exact: true }).click();
  await pending.started;
  await expect(title).toBeDisabled();
  await expect(page.getByRole('button', { name: '← 返回列表', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  expect(JSON.parse(repo.blobs[0]).galleryItems[0].title).toBe('Accepted gallery title');
  pending.release();
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Accepted gallery title');
  expect(repo.writes).toEqual([]);
});

test('gallery deletion disables cancel, repeat confirmation and edit until the request completes', async ({
  page,
}) => {
  const repo = await repository(page);
  await admin(page);
  await page.locator('aside').getByRole('button', { name: '图库', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '删除图库条目' });
  const pending = repo.pause('blob');
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await pending.started;
  await expect(dialog.getByRole('button', { name: '删除', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  pending.release();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /路途 · 窗外的工业/ })).toBeEnabled();
  expect(repo.writes).toEqual([]);
});

test('a stale blog snapshot rejects the save and leaves the accepted draft available', async ({
  page,
}) => {
  const repo = await repository(page);
  await admin(page);
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const title = page.locator('#schema-title');
  await title.fill('Accepted stale draft');
  repo.changeHead();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('内容已被其他提交修改');
  await expect(title).toHaveValue('Accepted stale draft');
  await expect(title).toBeEnabled();
  expect(repo.writes).toEqual([]);
});

for (const [panel, create, titlePlaceholder, slugPlaceholder] of [
  ['博客', '新建文章', '文章标题', 'hello-world'],
  ['项目', '新建项目', '项目名称', 'my-project'],
] as const) {
  test(`${panel} new-item title changes preserve a manually edited slug`, async ({ page }) => {
    await repository(page);
    await admin(page);
    if (panel === '项目')
      await page.locator('aside').getByRole('button', { name: panel, exact: true }).click();
    await page.getByRole('button', { name: create, exact: true }).click();
    const title = page.getByPlaceholder(titlePlaceholder, { exact: true });
    const slug = page.getByPlaceholder(slugPlaceholder, { exact: true });
    await title.fill('First title');
    await expect(slug).toHaveValue('first-title');
    await slug.fill('manual-slug');
    await title.fill('Second title');
    await expect(slug).toHaveValue('manual-slug');
  });
}
