// 本地 public/images 目录 → Cloudflare R2 同步脚本
//
// 用法：
//   node --env-file-if-exists=.env scripts/sync-images.mjs          # 默认 dry-run
//   node --env-file-if-exists=.env scripts/sync-images.mjs --apply  # 真正上传
//   node --env-file-if-exists=.env scripts/sync-images.mjs --apply --force   # 全部更新
//   node --env-file-if-exists=.env scripts/sync-images.mjs --apply --delete  # 删除远端多余对象
//   node --env-file-if-exists=.env scripts/sync-images.mjs --apply --delete-thumbnails # 仅删除远端缩略图
//
// 依赖环境变量：R2_ENDPOINT、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY
// 请在 .env 中配置，或参照 .env.example。
//
// 纯逻辑（计划计算 / MIME 映射 / XML 解析 / 编码 / 并发池）导出供
// scripts/sync-images.test.mjs 单测使用；仅直接运行时才执行 main()。

import { AwsClient } from 'aws4fetch';
import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../public/images', import.meta.url));

const ENDPOINT = process.env.R2_ENDPOINT;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const IS_APPLY = process.argv.includes('--apply');
const IS_FORCE = process.argv.includes('--force');
const IS_DELETE = process.argv.includes('--delete');
const IS_DELETE_THUMBNAILS = process.argv.includes('--delete-thumbnails');
const CONCURRENCY = 8;

const MIME_TYPES = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

function ensureEnv() {
  const missing = [];
  if (!ENDPOINT) missing.push('R2_ENDPOINT');
  if (!ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    console.error('错误：缺少以下环境变量：');
    for (const name of missing) {
      console.error(`  - ${name}`);
    }
    console.error('请参照 .env.example 配置后重试。');
    process.exit(1);
  }
}

export function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

export function getContentType(filePath) {
  const lower = filePath.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (lower.endsWith(ext)) return mime;
  }
  return 'application/octet-stream';
}

export function decodeXmlEntities(raw) {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function encodeKey(key) {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function isThumbnailKey(key) {
  return /^images\/[^/]+\/thumbs\/.+$/.test(key);
}

export function findThumbnailDeletions(remoteObjects) {
  return [...remoteObjects]
    .filter(([key]) => isThumbnailKey(key))
    .map(([key, size]) => ({ key, size }));
}

/**
 * 解析一页 ListObjectsV2 XML，返回 { objects: Map<key, size>, nextContinuationToken }。
 * 仅当 IsTruncated 为 true 时才返回 NextContinuationToken。
 */
export function parseListObjectsV2(text) {
  const objects = new Map();
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = contentsRegex.exec(text)) !== null) {
    const block = match[1];
    const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
    const sizeMatch = block.match(/<Size>([\s\S]*?)<\/Size>/);
    if (keyMatch) {
      const key = decodeXmlEntities(keyMatch[1]);
      const size = sizeMatch ? parseInt(decodeXmlEntities(sizeMatch[1]), 10) : 0;
      objects.set(key, size);
    }
  }

  const truncatedMatch = text.match(/<IsTruncated>(true|false)<\/IsTruncated>/i);
  const isTruncated = truncatedMatch?.[1].toLowerCase() === 'true';
  const tokenMatch = text.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
  const nextContinuationToken = isTruncated && tokenMatch ? decodeXmlEntities(tokenMatch[1]) : null;

  return { objects, nextContinuationToken };
}

async function* listLocalFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* listLocalFiles(full);
      continue;
    }
    const rel = relative(ROOT, full).split(sep).join('/');
    yield { fullPath: full, relativePosix: rel };
  }
}

async function buildLocalIndex() {
  const items = [];
  for await (const file of listLocalFiles(ROOT)) {
    const st = await stat(file.fullPath);
    items.push({
      fullPath: file.fullPath,
      relativePosix: file.relativePosix,
      key: `images/${file.relativePosix}`,
      size: st.size,
    });
  }
  return items;
}

async function listRemoteObjects(client) {
  const objects = new Map();
  let continuationToken = null;

  do {
    const params = new URLSearchParams({
      'list-type': '2',
      prefix: 'images/',
      'max-keys': '1000',
    });
    if (continuationToken) {
      params.set('continuation-token', continuationToken);
    }

    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await client.fetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`拉取远端列表失败：HTTP ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const page = parseListObjectsV2(text);
    for (const [key, size] of page.objects) {
      objects.set(key, size);
    }
    continuationToken = page.nextContinuationToken;
  } while (continuationToken);

  return objects;
}

export async function runWithPool(items, limit, fn) {
  const errors = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        await fn(item, currentIndex);
      } catch (err) {
        errors.push({ item, error: err });
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return errors;
}

/**
 * 计算同步计划：远端缺失 → 新增；size 不同（或 force）→ 更新；否则跳过。
 * includeDeletions 时额外计算「远端有而本地没有」的删除清单。
 */
export function buildSyncPlan(localItems, remoteObjects, options = {}) {
  const { force = false, includeDeletions = false } = options;

  const adds = [];
  const updates = [];
  const skips = [];

  for (const item of localItems) {
    const remoteSize = remoteObjects.get(item.key);
    if (remoteSize === undefined) {
      adds.push(item);
    } else if (force || remoteSize !== item.size) {
      updates.push(item);
    } else {
      skips.push(item);
    }
  }

  const deletions = [];
  if (includeDeletions) {
    const localKeySet = new Set(localItems.map((i) => i.key));
    for (const [key, size] of remoteObjects) {
      if (!localKeySet.has(key)) {
        deletions.push({ key, size });
      }
    }
  }

  const uploadBytes = [...adds, ...updates].reduce((sum, i) => sum + i.size, 0);
  return { adds, updates, skips, deletions, uploadBytes };
}

async function putObject(client, item) {
  const url = `${ENDPOINT}/${encodeKey(item.key)}`;
  const body = await readFile(item.fullPath);
  const headers = {
    'Content-Type': getContentType(item.fullPath),
    'Cache-Control': 'public, max-age=2592000',
  };
  const res = await client.fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
}

async function deleteObject(client, key) {
  const url = `${ENDPOINT}/${encodeKey(key)}`;
  const res = await client.fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
}

function printPlanSection(title, items) {
  console.log(`\n${title}：${items.length} 个`);
  for (const item of items.slice(0, 10)) {
    console.log(`  - ${item.key} (${formatBytes(item.size)})`);
  }
  if (items.length > 10) {
    console.log(`  ... 还有 ${items.length - 10} 个`);
  }
}

async function main() {
  ensureEnv();

  const client = new AwsClient({
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  console.log('正在扫描本地文件...');
  const localItems = await buildLocalIndex();

  console.log('正在拉取远端对象列表...');
  const remoteObjects = await listRemoteObjects(client);

  const { adds, updates, skips, deletions, uploadBytes } = buildSyncPlan(
    localItems,
    remoteObjects,
    { force: IS_FORCE, includeDeletions: IS_DELETE },
  );
  const thumbnailDeletions = IS_DELETE_THUMBNAILS
    ? findThumbnailDeletions(remoteObjects).filter(
        (item) => !deletions.some((deletion) => deletion.key === item.key),
      )
    : [];

  if (!IS_APPLY) {
    printPlanSection('新增', adds);
    printPlanSection('更新', updates);
    printPlanSection('跳过', skips);
    if (IS_DELETE) {
      printPlanSection('删除', deletions);
    }
    if (IS_DELETE_THUMBNAILS) {
      printPlanSection('删除缩略图', thumbnailDeletions);
    }

    console.log(`\n总上传字节数（新增 + 更新）：${formatBytes(uploadBytes)}`);
    console.log('当前为 dry-run，未执行任何上传/删除操作。');
    console.log('如需执行，请追加 --apply 参数。');
    process.exit(0);
  }

  console.log(
    `\n开始上传：新增 ${adds.length} 个，更新 ${updates.length} 个，并发 ${CONCURRENCY}...`,
  );
  const uploadErrors = await runWithPool([...adds, ...updates], CONCURRENCY, async (item, idx) => {
    const label = adds.includes(item) ? '新增' : '更新';
    await putObject(client, item);
    console.log(`  [${idx + 1}/${adds.length + updates.length}] ${label} ${item.key}`);
  });

  let deleteErrors = [];
  const objectsToDelete = [...(IS_DELETE ? deletions : []), ...thumbnailDeletions];
  if (objectsToDelete.length > 0) {
    console.log(`\n开始删除远端对象：${objectsToDelete.length} 个...`);
    deleteErrors = await runWithPool(objectsToDelete, CONCURRENCY, async (item, idx) => {
      await deleteObject(client, item.key);
      console.log(`  [${idx + 1}/${objectsToDelete.length}] 删除 ${item.key}`);
    });
  }

  const allErrors = [...uploadErrors, ...deleteErrors];
  if (allErrors.length > 0) {
    console.error(`\n失败 ${allErrors.length} 个：`);
    for (const { item, error } of allErrors) {
      console.error(`  - ${item.key}: ${error.message}`);
    }
    process.exit(1);
  }

  console.log('\n────────────────────────────');
  console.log('同步完成');
  console.log(
    `新增 ${adds.length} / 更新 ${updates.length} / 跳过 ${skips.length} / 删除 ${objectsToDelete.length}`,
  );
  console.log(`上传字节数：${formatBytes(uploadBytes)}`);
  console.log('────────────────────────────');
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
