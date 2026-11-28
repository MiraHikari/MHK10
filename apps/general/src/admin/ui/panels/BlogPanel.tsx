/**
 * 博客文章管理面板。
 * 支持列表、新建、编辑、删除与 GitHub 提交。
 */

import { useMemo, useState } from 'react';
import { BLOG_CONTENT_DIR } from '@/admin/config';
import { GitHubError } from '@/admin/github/client';
import { commitFiles, deleteFiles } from '@/admin/github/store';
import { serializeDocument } from '@/admin/content/frontmatter';
import { SITE_ORIGIN } from '@/lib/blog/legal';
import { slugify, validateSlug } from '@/admin/content/slug';
import { BLOG_FRONTMATTER_SCHEMA, validateSchemaValue } from '@/admin/schema';
import { Button, Card, ConfirmDialog, EmptyState, Spinner, TextInput } from '@/admin/ui/primitives';
import { SchemaForm } from '@/admin/ui/SchemaForm';
import { MarkdownField } from '@/admin/ui/panels/MarkdownField';
import { useCollection, type CollectionItem } from '@/admin/ui/panels/useCollection';
import ThinkingState from '@/components/ui/ThinkingState';
import { formatToday } from '@/admin/content/dates';

import IconPlus from '~icons/lucide/plus';
import IconPencil from '~icons/lucide/pencil';
import IconTrash from '~icons/lucide/trash-2';
import IconExternalLink from '~icons/lucide/external-link';
import IconArrowLeft from '~icons/lucide/arrow-left';

function isGitHubAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

function formatGitHubError(error: unknown): string {
  if (error instanceof GitHubError) {
    let message = error.message;
    if (isGitHubAuthError(error.status)) {
      message += '。Token 可能已失效，请到右上角退出后重新登录';
    }
    return message;
  }
  return error instanceof Error ? error.message : '操作失败';
}

function getStringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

function getStringListField(data: Record<string, unknown>, key: string): readonly string[] {
  const value = data[key];
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : [];
}

type ViewMode =
  | { type: 'list' }
  | { type: 'create'; ext: string; item: CollectionItem }
  | { type: 'edit'; item: CollectionItem };

interface SuccessState {
  htmlUrl: string;
  message: string;
}

export function BlogPanel({
  onPendingChange,
}: { onPendingChange?: (pending: boolean) => void } = {}) {
  const { items, headSha, loading, error, reload } = useCollection(BLOG_CONTENT_DIR, [
    '.md',
    '.mdx',
  ]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>({ type: 'list' });
  const [deleting, setDeleting] = useState<CollectionItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const query = search.trim().toLowerCase();
    let result = items;
    if (query) {
      result = items.filter((item) => {
        const title = getStringField(item.data, 'title').toLowerCase();
        const id = item.id.toLowerCase();
        const tags = getStringListField(item.data, 'tags').join(' ').toLowerCase();
        return title.includes(query) || id.includes(query) || tags.includes(query);
      });
    }
    return result.toSorted((a, b) => {
      const dateA = getStringField(a.data, 'publishDate');
      const dateB = getStringField(b.data, 'publishDate');
      if (dateA && dateB) return dateB.localeCompare(dateA);
      if (dateA) return -1;
      if (dateB) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [items, search]);

  const handleCreate = (slug: string, ext: string) => {
    const path = `${BLOG_CONTENT_DIR}/${slug}${ext}`;
    setView({
      type: 'create',
      ext,
      item: {
        path,
        id: slug,
        data: {
          title: '',
          description: '',
          publishDate: formatToday(),
          tags: [],
          draft: true,
          featured: false,
        },
        body: '',
      },
    });
    setSuccess(null);
    setActionError(null);
  };

  const handleEdit = (item: CollectionItem) => {
    setView({ type: 'edit', item });
    setSuccess(null);
    setActionError(null);
  };

  const handleBack = () => {
    if (saving) return;
    setView({ type: 'list' });
    setActionError(null);
  };

  const handleSave = async (item: CollectionItem, isNew: boolean) => {
    if (saving) return;
    setSaving(true);
    onPendingChange?.(true);
    setActionError(null);
    try {
      if (!headSha) throw new Error('内容快照已失效，请重新加载后重试');
      const validation = validateSchemaValue(BLOG_FRONTMATTER_SCHEMA, item.data);
      if (validation.length > 0) throw new Error(validation.join('；'));
      const text = serializeDocument(item.data, item.body);
      const action = isNew ? 'add' : 'update';
      const result = await commitFiles(
        `content(blog): ${action} ${item.id}`,
        [{ path: item.path, text }],
        { expectedHeadSha: headSha },
      );
      setSuccess({
        htmlUrl: result.htmlUrl,
        message: '已推送到 main，EdgeOne 正在自动部署，约 1-2 分钟后线上生效',
      });
      setView({ type: 'list' });
      reload();
    } catch (error) {
      setActionError(formatGitHubError(error));
    } finally {
      setSaving(false);
      onPendingChange?.(false);
    }
  };

  const handleDelete = async (item: CollectionItem) => {
    if (saving) return;
    setSaving(true);
    onPendingChange?.(true);
    setActionError(null);
    try {
      if (!headSha) throw new Error('内容快照已失效，请重新加载后重试');
      const result = await deleteFiles(`content(blog): remove ${item.id}`, [item.path], {
        expectedHeadSha: headSha,
      });
      setSuccess({
        htmlUrl: result.htmlUrl,
        message: '已推送到 main，EdgeOne 正在自动部署，约 1-2 分钟后线上生效',
      });
      setDeleting(null);
      reload();
    } catch (error) {
      setActionError(formatGitHubError(error));
    } finally {
      setSaving(false);
      onPendingChange?.(false);
    }
  };

  const updateEditingData = (next: Record<string, unknown>) => {
    if (view.type === 'list') return;
    setView({ ...view, item: { ...view.item, data: next } });
  };

  const updateEditingBody = (body: string) => {
    if (view.type === 'list') return;
    setView({ ...view, item: { ...view.item, body } });
  };

  const dismissSuccess = () => setSuccess(null);
  const dismissError = () => setActionError(null);

  if (view.type !== 'list') {
    const isCreate = view.type === 'create';
    const item = view.item;
    return (
      <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0 space-y-5" aria-busy={saving}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleBack}>
            <IconArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <div className="flex items-center gap-2">
            <a
              href={`${SITE_ORIGIN}/blog/${item.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 border border-white/10"
            >
              查看线上
              <IconExternalLink className="h-4 w-4" />
            </a>
            <Button variant="primary" onClick={() => handleSave(item, isCreate)} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : '保存'}
            </Button>
          </div>
        </div>

        {actionError && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
          >
            {actionError}
            <button
              type="button"
              onClick={dismissError}
              className="ml-2 text-red-300 hover:text-white"
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        )}

        <Card className="space-y-6">
          <SchemaForm
            schema={BLOG_FRONTMATTER_SCHEMA}
            value={item.data}
            onChange={updateEditingData}
          />
          <MarkdownField
            label="正文"
            value={item.body}
            placeholder="在此输入 Markdown 正文…"
            onChange={updateEditingBody}
          />
        </Card>
      </fieldset>
    );
  }

  return (
    <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0 space-y-4" aria-busy={saving}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 max-w-md">
          <TextInput value={search} placeholder="搜索标题、ID 或标签" onChange={setSearch} />
        </div>
        <NewArticleButton onCreate={handleCreate} />
      </div>

      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <span>{success.message}</span>
          {success.htmlUrl && (
            <>
              {' '}
              <a
                href={success.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-emerald-100"
              >
                查看 commit
              </a>
            </>
          )}
          <button
            type="button"
            onClick={dismissSuccess}
            className="ml-2 text-emerald-300 hover:text-white"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
          role="alert"
        >
          {actionError}
          <button
            type="button"
            onClick={dismissError}
            className="ml-2 text-red-300 hover:text-white"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <ThinkingState dark label="LOADING" />
        </div>
      )}

      {!loading && error && <EmptyState title="加载失败" description={error} />}

      {!loading && !error && filteredItems && filteredItems.length === 0 && (
        <EmptyState
          title="暂无文章"
          description={search ? '没有匹配当前搜索的文章' : '点击右上角新建文章'}
        />
      )}

      {!loading && !error && filteredItems && filteredItems.length > 0 && (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <ArticleRow
              key={item.path}
              item={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="删除文章"
        description={
          deleting
            ? `确定删除「${getStringField(deleting.data, 'title') || deleting.id}」吗？此操作不可撤销。`
            : undefined
        }
        confirmText="删除"
        cancelText="取消"
        onConfirm={() => deleting && handleDelete(deleting)}
        onCancel={() => {
          if (!saving) setDeleting(null);
        }}
      />
    </fieldset>
  );
}

function ArticleRow({
  item,
  onEdit,
  onDelete,
}: {
  item: CollectionItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const title = getStringField(item.data, 'title') || item.id;
  const date = getStringField(item.data, 'publishDate');
  const draft = Boolean(item.data.draft);
  const featured = Boolean(item.data.featured);

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-zinc-900/50 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium text-zinc-100" title={title}>
          {title}
        </p>
        <p className="text-xs text-zinc-500">
          {item.id}
          {date && ` · ${date}`}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {draft && (
            <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">
              草稿
            </span>
          )}
          {featured && (
            <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-200">
              精选
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={onEdit} className="px-2.5 py-1.5 min-h-9">
          <IconPencil className="h-4 w-4" />
          <span className="hidden sm:inline">编辑</span>
        </Button>
        <Button variant="danger" onClick={onDelete} className="px-2.5 py-1.5 min-h-9">
          <IconTrash className="h-4 w-4" />
          <span className="hidden sm:inline">删除</span>
        </Button>
      </div>
    </div>
  );
}

function NewArticleButton({ onCreate }: { onCreate: (slug: string, ext: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ext, setExt] = useState('.md');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setOpen(false);
    setTitle('');
    setSlug('');
    setSlugEdited(false);
    setExt('.md');
    setError(null);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  };

  const handleConfirm = () => {
    const finalSlug = slug.trim() || slugify(title);
    const validation = validateSlug(finalSlug);
    if (validation) {
      setError(validation);
      return;
    }
    onCreate(finalSlug, ext);
    handleClose();
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <IconPlus className="h-4 w-4" />
        新建文章
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-zinc-900 p-5 shadow-xl space-y-4">
        <h3 className="text-base font-semibold text-zinc-100">新建文章</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-200">标题</label>
            <TextInput value={title} placeholder="文章标题" onChange={handleTitleChange} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-200">Slug</label>
            <TextInput
              value={slug}
              placeholder="hello-world"
              onChange={(value) => {
                setSlug(value);
                setSlugEdited(true);
              }}
            />
            <p className="text-xs text-zinc-500">可留空，将自动根据标题生成</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-200">格式</label>
            <select
              value={ext}
              onChange={(e) => setExt(e.target.value)}
              className="w-full min-h-11 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            >
              <option value=".md">Markdown (.md)</option>
              <option value=".mdx">MDX (.mdx)</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleConfirm}>创建</Button>
        </div>
      </div>
    </div>
  );
}
