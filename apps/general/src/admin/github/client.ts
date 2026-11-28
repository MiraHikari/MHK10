import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '@/lib/storage/keys';

const API_BASE = 'https://api.github.com';
const STORAGE_KEY = STORAGE_KEYS.adminGhPat;
const API_VERSION = '2022-11-28';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return readStorage(STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  writeStorage(STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return;
  removeStorage(STORAGE_KEY);
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

function describeStatus(status: number): string {
  if (status === 401) return 'PAT 无效或已过期，请重新登录';
  if (status === 403) return '权限不足，请检查 PAT 是否具有 contents 读写权限';
  if (status === 404) return '请求的资源不存在';
  if (status === 422) return '请求参数错误';
  if (status >= 500) return 'GitHub 服务暂时不可用，请稍后重试';
  return '请求失败';
}

function summarizeValidationErrors(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'errors' in payload &&
    Array.isArray(payload.errors)
  ) {
    return payload.errors
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const parts: string[] = [];
          if ('field' in entry && entry.field) parts.push(String(entry.field));
          if ('message' in entry && entry.message) parts.push(String(entry.message));
          if ('code' in entry && entry.code) parts.push(`(${String(entry.code)})`);
          return parts.join(' ');
        }
        return String(entry);
      })
      .join('; ');
  }
  return '';
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  const token = getStoredToken();
  if (!token) {
    throw new GitHubError('未找到 GitHub PAT，请先登录', 401);
  }

  const url = `${API_BASE}${path}`;
  const accept = init?.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json';

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-GitHub-Api-Version', API_VERSION);
  headers.set('Accept', accept);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await response.text().catch(() => undefined);
    }

    const summary = summarizeValidationErrors(payload);
    const base = describeStatus(response.status);
    const message = summary ? `${base}：${summary}` : `${base}（${response.status}）`;
    throw new GitHubError(message, response.status, payload);
  }

  if (init?.raw) {
    return (await response.text()) as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

interface GitHubUser {
  login: string;
}

export async function validateToken(token: string): Promise<{ login: string }> {
  const url = `${API_BASE}/user`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-GitHub-Api-Version', API_VERSION);
  headers.set('Accept', 'application/vnd.github+json');

  const response = await fetch(url, { headers });

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = await response.text().catch(() => undefined);
    }
    const summary = summarizeValidationErrors(payload);
    const base = describeStatus(response.status);
    const message = summary ? `${base}：${summary}` : `${base}（${response.status}）`;
    throw new GitHubError(message, response.status, payload);
  }

  const user = (await response.json()) as GitHubUser;
  return { login: user.login };
}
