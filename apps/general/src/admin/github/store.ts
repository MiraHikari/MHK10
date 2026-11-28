import {
  GITHUB_BRANCH,
  GITHUB_OWNER,
  GITHUB_REPO,
  BLOG_CONTENT_DIR,
  PROJECTS_CONTENT_DIR,
  PROFILE_JSON_PATH,
  GENERAL_PUBLIC_IMAGE_DIR,
} from '@/admin/config';
import { apiFetch, GitHubError } from '@/admin/github/client';

export interface ContentFileSpec {
  path: string;
  text?: string;
  base64?: string;
}

interface GitRef {
  object: { sha: string };
}

interface GitCommit {
  sha: string;
  tree: { sha: string };
  html_url?: string;
}

interface GitBlob {
  sha: string;
}

interface GitTree {
  sha: string;
}

interface GitTreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  sha: string | null;
}

interface RepoTree {
  tree: Array<{ path: string; type: 'blob' | 'tree' }>;
  truncated?: boolean;
}

interface RecentCommit {
  sha: string;
  commit: {
    message: string;
    author: { date?: string } | null;
    committer: { date?: string } | null;
  };
  html_url: string;
}

const OWNER_REPO = `${GITHUB_OWNER}/${GITHUB_REPO}`;
const MAX_RETRIES = 3;

const ALLOWED_PATH_PREFIXES = [
  `${BLOG_CONTENT_DIR}/`,
  `${PROJECTS_CONTENT_DIR}/`,
  PROFILE_JSON_PATH,
  `${GENERAL_PUBLIC_IMAGE_DIR}/`,
] as const;

function assertAllowedPath(path: string): void {
  const normalized = path.replace(/\\/g, '/');
  if (
    normalized !== path ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    !ALLOWED_PATH_PREFIXES.some((prefix) =>
      prefix.endsWith('/') ? normalized.startsWith(prefix) : normalized === prefix,
    )
  ) {
    throw new GitHubError(`禁止写入仓库路径：${path}`, 422);
  }
}

function isFastForwardConflict(error: GitHubError): boolean {
  if (error.status !== 422) return false;
  const payload = error.payload;
  const message =
    payload && typeof payload === 'object' && 'message' in payload
      ? String(payload.message)
      : error.message;
  return /fast.?forward|reference update failed|another update/i.test(message);
}

export async function getBranchHeadSha(): Promise<string> {
  const ref = await apiFetch<GitRef>(`/repos/${OWNER_REPO}/git/ref/heads/${GITHUB_BRANCH}`);
  return ref.object.sha;
}

export async function getTextFile(path: string, ref = GITHUB_BRANCH): Promise<string> {
  return apiFetch<string>(
    `/repos/${OWNER_REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    { raw: true },
  );
}

export async function listRepoPaths(prefix: string, ref = GITHUB_BRANCH): Promise<string[]> {
  const tree = await apiFetch<RepoTree>(
    `/repos/${OWNER_REPO}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );

  if (tree.truncated) {
    throw new GitHubError('仓库文件树过大，无法完整列出，请缩小前缀或联系管理员', 422);
  }

  return tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
    .map((entry) => entry.path);
}

async function createBlob(file: ContentFileSpec): Promise<string> {
  if (file.text !== undefined) {
    const blob = await apiFetch<GitBlob>(`/repos/${OWNER_REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.text, encoding: 'utf-8' }),
    });
    return blob.sha;
  }

  if (file.base64 !== undefined) {
    const blob = await apiFetch<GitBlob>(`/repos/${OWNER_REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.base64, encoding: 'base64' }),
    });
    return blob.sha;
  }

  throw new GitHubError(`文件 ${file.path} 缺少 text 或 base64 内容`, 422);
}

async function buildCommit(
  message: string,
  treeEntries: GitTreeEntry[],
  expectedHeadSha?: string,
): Promise<GitCommit> {
  const headSha = await getBranchHeadSha();
  if (expectedHeadSha && headSha !== expectedHeadSha) {
    throw new GitHubError('内容已被其他提交修改，请刷新后重试', 409, {
      expectedHeadSha,
      actualHeadSha: headSha,
    });
  }

  const parentCommit = await apiFetch<GitCommit>(`/repos/${OWNER_REPO}/git/commits/${headSha}`);
  const baseTreeSha = parentCommit.tree.sha;

  const newTree = await apiFetch<GitTree>(`/repos/${OWNER_REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries,
    }),
  });

  const newCommit = await apiFetch<GitCommit>(`/repos/${OWNER_REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [headSha],
    }),
  });

  await apiFetch<GitRef>(`/repos/${OWNER_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });

  return newCommit;
}

async function commitWithRetry(
  message: string,
  treeEntries: GitTreeEntry[],
  expectedHeadSha?: string,
): Promise<{ commitSha: string; htmlUrl: string }> {
  let lastError: GitHubError | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const commit = await buildCommit(message, treeEntries, expectedHeadSha);
      return {
        commitSha: commit.sha,
        htmlUrl: commit.html_url ?? '',
      };
    } catch (error) {
      if (error instanceof GitHubError && isFastForwardConflict(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw new GitHubError('提交冲突，请刷新后重试', lastError?.status ?? 422, lastError?.payload);
}

export async function commitFiles(
  message: string,
  files: readonly ContentFileSpec[],
  options: { readonly expectedHeadSha?: string } = {},
): Promise<{ commitSha: string; htmlUrl: string }> {
  for (const file of files) assertAllowedPath(file.path);
  const entries: GitTreeEntry[] = [];

  for (const file of files) {
    const sha = await createBlob(file);
    entries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha,
    });
  }

  return commitWithRetry(message, entries, options.expectedHeadSha);
}

export async function deleteFiles(
  message: string,
  paths: readonly string[],
  options: { readonly expectedHeadSha?: string } = {},
): Promise<{ commitSha: string; htmlUrl: string }> {
  for (const path of paths) assertAllowedPath(path);
  const entries: GitTreeEntry[] = paths.map((path) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha: null,
  }));

  return commitWithRetry(message, entries, options.expectedHeadSha);
}

export async function getRecentCommits(
  limit = 10,
): Promise<Array<{ sha: string; message: string; date: string; htmlUrl: string }>> {
  const commits = await apiFetch<RecentCommit[]>(
    `/repos/${OWNER_REPO}/commits?sha=${GITHUB_BRANCH}&per_page=${limit}`,
  );

  return commits.map((entry) => ({
    sha: entry.sha,
    message: entry.commit.message,
    date: entry.commit.committer?.date ?? entry.commit.author?.date ?? '',
    htmlUrl: entry.html_url,
  }));
}
