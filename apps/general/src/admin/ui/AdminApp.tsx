import { useMemo, useState } from 'react';
import { Button } from '@/admin/ui/primitives';
import { clearStoredToken, getStoredToken } from '@/admin/github/client';
import { clearStoredCredentials, getStoredCredentials } from '@/admin/r2/client';
import { LoginGate } from '@/admin/ui/LoginGate';
import { BlogPanel } from '@/admin/ui/panels/BlogPanel';
import { ProjectsPanel } from '@/admin/ui/panels/ProjectsPanel';
import { ProfilePanel } from '@/admin/ui/panels/ProfilePanel';
import { GalleryPanel } from '@/admin/ui/panels/GalleryPanel';
import { CommitsPanel } from '@/admin/ui/panels/CommitsPanel';
import { SITE_ORIGIN } from '@/lib/blog/legal';
import FileText from '~icons/lucide/file-text';
import FolderKanban from '~icons/lucide/folder-kanban';
import UserRound from '~icons/lucide/user-round';
import Image from '~icons/lucide/image';
import GitCommitHorizontal from '~icons/lucide/git-commit-horizontal';
import ExternalLink from '~icons/lucide/external-link';
import LogOut from '~icons/lucide/log-out';

type TabKey = 'blog' | 'projects' | 'profile' | 'gallery' | 'commits';

interface NavItem {
  key: TabKey;
  label: string;
  icon: typeof FileText;
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: 'blog', label: '博客', icon: FileText },
  { key: 'projects', label: '项目', icon: FolderKanban },
  { key: 'profile', label: '资料', icon: UserRound },
  { key: 'gallery', label: '图库', icon: Image },
  { key: 'commits', label: '提交', icon: GitCommitHorizontal },
] as const;

export default function AdminApp() {
  const [token, setToken] = useState(getStoredToken);
  const [r2Credentials, setR2Credentials] = useState(getStoredCredentials);
  const [tab, setTab] = useState<TabKey>('blog');
  const [pending, setPending] = useState(false);

  const activePanel = useMemo(() => {
    switch (tab) {
      case 'blog':
        return <BlogPanel onPendingChange={setPending} />;
      case 'projects':
        return <ProjectsPanel onPendingChange={setPending} />;
      case 'profile':
        return <ProfilePanel onPendingChange={setPending} />;
      case 'gallery':
        return <GalleryPanel r2Credentials={r2Credentials} onPendingChange={setPending} />;
      case 'commits':
        return <CommitsPanel />;
    }
  }, [tab, r2Credentials]);

  if (!token) {
    return (
      <LoginGate
        onSuccess={() => {
          setToken(getStoredToken());
          setR2Credentials(getStoredCredentials());
        }}
      />
    );
  }

  const handleLogout = () => {
    if (pending) return;
    clearStoredToken();
    clearStoredCredentials();
    setToken(null);
    setR2Credentials(null);
  };

  return (
    <div className="min-h-screen flex">
      {/* 桌面侧边导航 */}
      <aside className="hidden sm:flex fixed inset-y-0 left-0 w-52 flex-col border-r border-white/10 bg-zinc-950">
        <div className="px-4 py-5">
          <h1 className="text-lg font-semibold text-zinc-100">内容管理</h1>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              disabled={pending}
              onClick={() => {
                if (!pending) setTab(key);
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 sm:pl-52">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
          <h2 className="text-base font-medium text-zinc-100">
            {NAV_ITEMS.find((i) => i.key === tab)?.label}
          </h2>
          <div className="flex items-center gap-2">
            <a
              href={SITE_ORIGIN}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              查看站点
            </a>
            <Button variant="ghost" onClick={handleLogout} disabled={pending}>
              <LogOut className="w-4 h-4" />
              退出登录
            </Button>
          </div>
        </header>

        <main className="px-4 sm:px-6 py-6 pb-24 sm:pb-8">{activePanel}</main>
      </div>

      {/* 移动端底部 tab 栏 */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 flex items-end border-t border-white/10 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            disabled={pending}
            onClick={() => {
              if (!pending) setTab(key);
            }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
              tab === key ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
