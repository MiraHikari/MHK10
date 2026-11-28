import { useEffect, useState } from 'react';
import { Card, EmptyState } from '@/admin/ui/primitives';
import { GitHubError } from '@/admin/github/client';
import { getRecentCommits } from '@/admin/github/store';
import ThinkingState from '@/components/ui/ThinkingState';
import ExternalLink from '~icons/lucide/external-link';

interface CommitItem {
  sha: string;
  message: string;
  date: string;
  htmlUrl: string;
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '未知时间';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0] ?? message;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function CommitsPanel() {
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRecentCommits(15)
      .then((items) => {
        if (!cancelled) setCommits(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof GitHubError ? err.message : '加载提交历史失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
        每次保存都会推送到 main 分支，EdgeOne 检测到新 commit 后自动构建部署，通常 1-2 分钟。
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <ThinkingState dark label="LOADING COMMITS" />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!loading && !error && commits.length === 0 && (
        <EmptyState title="暂无提交记录" description="保存内容后即可在此看到部署进度。" />
      )}

      {!loading && !error && commits.length > 0 && (
        <div className="space-y-2">
          {commits.map((commit) => (
            <Card key={commit.sha} className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">
                  {firstLine(commit.message)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  <span className="font-mono text-zinc-400">{shortSha(commit.sha)}</span>
                  <span className="mx-2">·</span>
                  <span>{formatRelativeTime(commit.date)}</span>
                </p>
              </div>
              <a
                href={commit.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
                aria-label="在 GitHub 查看提交"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
