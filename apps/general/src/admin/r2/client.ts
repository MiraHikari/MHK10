import { AwsClient } from 'aws4fetch';
import { STORAGE_KEYS, readJsonStorage, removeStorage, writeJsonStorage } from '@/lib/storage/keys';

const STORAGE_KEY = STORAGE_KEYS.adminR2;

export interface R2Credentials {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function normalizeR2Endpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new R2Error('R2 endpoint 格式无效', 400);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/i.test(url.hostname) ||
    url.pathname.split('/').filter(Boolean).length !== 1
  ) {
    throw new R2Error('R2 endpoint 必须是 Cloudflare R2 的 HTTPS S3 endpoint', 400);
  }
  return url.toString().replace(/\/$/, '');
}

function assertSafeKey(key: string): void {
  if (
    !key.startsWith('images/') ||
    key.includes('\\') ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    !/^images\/(gallery|honors|projects)\/.+/.test(key)
  ) {
    throw new R2Error('R2 object key 不在允许的图片目录内', 400);
  }
}

function assertSafePrefix(prefix: string): void {
  if (prefix !== 'images/' && !/^images\/(gallery|honors|projects)\/$/.test(prefix)) {
    throw new R2Error('R2 prefix 不在允许的图片目录内', 400);
  }
}

export function getStoredCredentials(): R2Credentials | null {
  if (typeof window === 'undefined') return null;
  const parsed = readJsonStorage<unknown>(STORAGE_KEY);
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'endpoint' in parsed &&
    'accessKeyId' in parsed &&
    'secretAccessKey' in parsed &&
    typeof parsed.endpoint === 'string' &&
    typeof parsed.accessKeyId === 'string' &&
    typeof parsed.secretAccessKey === 'string'
  ) {
    const credentials = parsed as R2Credentials;
    try {
      return { ...credentials, endpoint: normalizeR2Endpoint(credentials.endpoint) };
    } catch {
      removeStorage(STORAGE_KEY);
      return null;
    }
  }
  if (parsed !== null) removeStorage(STORAGE_KEY);
  return null;
}

export function setStoredCredentials(credentials: R2Credentials): void {
  if (typeof window === 'undefined') return;
  writeJsonStorage(STORAGE_KEY, {
    ...credentials,
    endpoint: normalizeR2Endpoint(credentials.endpoint),
  });
}

export function clearStoredCredentials(): void {
  if (typeof window === 'undefined') return;
  removeStorage(STORAGE_KEY);
}

export class R2Error extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'R2Error';
  }
}

function describeStatus(status: number): string {
  if (status === 401 || status === 403) return 'R2 凭据无效或权限不足';
  if (status === 404) return 'R2 对象不存在';
  if (status >= 500) return 'R2 服务暂时不可用，请稍后重试';
  return 'R2 请求失败';
}

function getAwsClient(credentials: R2Credentials): AwsClient {
  normalizeR2Endpoint(credentials.endpoint);
  return new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
}

function buildR2Url(endpoint: string, key: string, query?: string): URL {
  if (key) assertSafeKey(key);
  normalizeR2Endpoint(endpoint);
  const normalizedEndpoint = endpoint.replace(/\/+$/, '');
  const encodedKey = encodeKey(key).replace(/^\//, '');
  const url = new URL(encodedKey, `${normalizedEndpoint}/`);
  if (query) url.search = query;
  return url;
}

/**
 * 对 R2 object key 做段级编码：保留 `/` 作为路径分隔，
 * 对每一段调用 encodeURIComponent，避免中文字符或特殊符号破坏 URL。
 */
export function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function putObject(
  credentials: R2Credentials,
  key: string,
  body: Blob,
  contentType: string,
  options: { onlyIfAbsent?: boolean } = {},
): Promise<void> {
  const client = getAwsClient(credentials);
  const url = buildR2Url(credentials.endpoint, key);

  const signal = AbortSignal.timeout(5 * 60 * 1000);
  let response: Response;
  try {
    response = await client.fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=2592000',
        ...(options.onlyIfAbsent ? { 'If-None-Match': '*' } : {}),
      },
      body,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new R2Error('R2 上传超时，请确认对象状态后重试', 408);
    throw error;
  }

  if (!response.ok) {
    if (response.status === 412) throw new R2Error('图片名已被其他上传占用，请重新上传', 412);
    throw new R2Error(`${describeStatus(response.status)}（${response.status}）`, response.status);
  }
}

export interface R2Upload {
  readonly key: string;
  readonly body: Blob;
  readonly contentType: string;
}

/** Upload a batch and compensate for objects that succeeded before a failure. */
export async function putObjectsWithRollback(
  credentials: R2Credentials,
  uploads: readonly R2Upload[],
): Promise<void> {
  const uniqueKeys = new Set(uploads.map((upload) => upload.key));
  if (uniqueKeys.size !== uploads.length) throw new R2Error('上传包含重复图片路径', 400);
  uploads.forEach((upload) => assertSafeKey(upload.key));
  const completed: string[] = [];
  try {
    for (const upload of uploads) {
      await putObject(credentials, upload.key, upload.body, upload.contentType, {
        onlyIfAbsent: true,
      });
      completed.push(upload.key);
    }
  } catch (error) {
    await Promise.allSettled(completed.map((key) => deleteObject(credentials, key)));
    throw error;
  }
}

export async function deleteObject(credentials: R2Credentials, key: string): Promise<void> {
  const client = getAwsClient(credentials);
  const url = buildR2Url(credentials.endpoint, key);

  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await client.fetch(url.toString(), { method: 'DELETE', signal });
  } catch (error) {
    if (signal.aborted) throw new R2Error('R2 删除超时', 408);
    throw error;
  }

  if (!response.ok) {
    throw new R2Error(`${describeStatus(response.status)}（${response.status}）`, response.status);
  }
}

export interface ListObjectsResult {
  keys: string[];
  nextCursor?: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * 用正则解析 S3 ListObjectsV2 XML，返回 key 列表与可选的翻页 token。
 * 使用正则而非 DOMParser，以便在 Node / Vitest 环境中直接测试。
 */
export function parseListObjectsV2(xml: string): ListObjectsResult {
  const keys: string[] = [];
  const keyMatches = xml.matchAll(/<Key>([^<]*)<\/Key>/g);
  for (const match of keyMatches) {
    keys.push(decodeXmlEntities(match[1] ?? ''));
  }

  const nextMatch = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  const nextCursor = nextMatch?.[1] ? decodeXmlEntities(nextMatch[1]) : undefined;

  return {
    keys,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

export async function listObjects(credentials: R2Credentials, prefix: string): Promise<string[]> {
  assertSafePrefix(prefix);
  const client = getAwsClient(credentials);
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const params = new URLSearchParams({
      'list-type': '2',
      prefix,
    });
    if (continuationToken) {
      params.set('continuation-token', continuationToken);
    }

    const url = buildR2Url(credentials.endpoint, '', params.toString());
    const signal = AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await client.fetch(url.toString(), { method: 'GET', signal });
    } catch (error) {
      if (signal.aborted) throw new R2Error('R2 列表请求超时', 408);
      throw error;
    }

    if (!response.ok) {
      throw new R2Error(
        `${describeStatus(response.status)}（${response.status}）`,
        response.status,
      );
    }

    const xml = await response.text();
    const result = parseListObjectsV2(xml);
    keys.push(...result.keys);
    continuationToken = result.nextCursor;
  } while (continuationToken);

  return keys;
}

/**
 * 探活 R2 凭据：发起一次仅返回 1 条记录的 ListObjectsV2 请求，
 * 任何非 2xx 响应都视为凭据无效。
 */
export async function validateCredentials(credentials: R2Credentials): Promise<void> {
  normalizeR2Endpoint(credentials.endpoint);
  const client = getAwsClient(credentials);
  const params = new URLSearchParams({
    'list-type': '2',
    prefix: '',
    'max-keys': '1',
  });
  const url = buildR2Url(credentials.endpoint, '', params.toString());

  const signal = AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await client.fetch(url.toString(), { method: 'GET', signal });
  } catch (error) {
    if (signal.aborted) throw new R2Error('R2 凭据验证超时', 408);
    throw error;
  }

  if (!response.ok) {
    throw new R2Error(`${describeStatus(response.status)}（${response.status}）`, response.status);
  }
}
