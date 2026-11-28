/**
 * 图库面板：管理 galleryItems 条目与上传图片。
 * 图片二进制通过浏览器直传 R2（S3 直连），元数据仍通过 GitHub commit 保存。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FieldRow,
  Select,
  Spinner,
} from '@/admin/ui/primitives';
import { SchemaForm } from '@/admin/ui/SchemaForm';
import { PROFILE_SECTION_SCHEMAS } from '@/admin/schema';
import { type ImageFolder, r2KeyPrefix } from '@/admin/config';
import { listObjects, putObjectsWithRollback, type R2Credentials } from '@/admin/r2/client';
import { generateImageDerivative } from '@/admin/image/derivatives';
import { slugify } from '@/admin/content/slug';
import { loadProfileSnapshot, saveProfileSection } from '@/admin/ui/panels/profileStore';
import { resolveImageSrc } from '@/lib/images/url';
import { canonicalUploadPath } from '@mhk/site-core/media/image-path';
import { STORAGE_KEYS, writeJsonStorage } from '@/lib/storage/keys';
import { formatClock, formatToday, toLocalIsoString } from '@/admin/content/dates';
import ThinkingState from '@/components/ui/ThinkingState';

const FOLDER_OPTIONS = [
  { value: 'gallery', label: '图库 gallery' },
  { value: 'honors', label: '荣誉 honors' },
  { value: 'projects', label: '项目 projects' },
];

const GALLERY_FIELDS = PROFILE_SECTION_SCHEMAS.galleryItems.schema[0].fields ?? [];

function formatDateLabel(date: Date, precision: 'year' | 'month' | 'date' | 'datetime'): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  if (precision === 'year') return y;
  if (precision === 'month') return `${y}.${m}`;
  if (precision === 'date') return `${y}.${m}.${d}`;

  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} · ${h}:${min}`;
}

function deriveExt(format: 'webp' | 'jpeg'): string {
  return format === 'webp' ? 'webp' : 'jpg';
}

function getOriginalExt(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return 'jpg';
  return parts[parts.length - 1].toLowerCase();
}

function makeStem(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const slug = slugify(base);
  return slug || '';
}

function makeDefaultStem(): string {
  return `img-${formatToday().replaceAll('-', '')}-${formatClock().replace(':', '')}`;
}

function buildDraftItem(
  folder: ImageFolder,
  stem: string,
  originalExt: string,
  derivExt: string,
  derivative: {
    width: number;
    height: number;
  },
  order: number,
): Record<string, unknown> {
  const now = new Date();

  return {
    title: '',
    location: '',
    year: String(now.getFullYear()),
    date: toLocalIsoString(now),
    dateLabel: formatDateLabel(now, 'date'),
    datePrecision: 'date',
    order,
    category: '',
    imageSrc: canonicalUploadPath(folder, `${stem}-display`, derivExt),
    downloadSrc: folder === 'projects' ? undefined : canonicalUploadPath(folder, stem, originalExt),
    imageAlt: '',
    width: derivative.width,
    height: derivative.height,
  };
}

async function allocateStem(
  credentials: R2Credentials,
  folder: ImageFolder,
  stem: string,
  originalExt: string,
  derivExt: string,
): Promise<string> {
  const prefix = r2KeyPrefix(folder);
  const existing = new Set(await listObjects(credentials, `${prefix}/`));

  let candidate = stem;
  let suffix = 1;

  while (true) {
    const keys: string[] = [];

    if (folder === 'projects') {
      keys.push(`${prefix}/${candidate}.${derivExt}`);
    } else {
      keys.push(`${prefix}/${candidate}.${originalExt}`);
      keys.push(`${prefix}/${candidate}-display.${derivExt}`);
    }

    if (!keys.some((k) => existing.has(k))) {
      return candidate;
    }

    suffix++;
    candidate = `${stem}-${suffix}`;
  }
}

export interface GalleryPanelProps {
  r2Credentials: R2Credentials | null;
  onPendingChange?: (pending: boolean) => void;
}

export function GalleryPanel({ r2Credentials, onPendingChange }: GalleryPanelProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [profileHeadSha, setProfileHeadSha] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitSha: string; htmlUrl: string } | null>(null);

  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown> | null>(null);
  const [editOriginal, setEditOriginal] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState<boolean>(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const [folder, setFolder] = useState<ImageFolder>('gallery');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [projectImagePath, setProjectImagePath] = useState<string | null>(null);
  const [copiedImage, setCopiedImage] = useState<boolean>(false);
  const copyTimer = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const canUpload = r2Credentials !== null;

  useEffect(() => {
    let cancelled = false;

    loadProfileSnapshot()
      .then(({ data: profile, headSha }) => {
        if (cancelled) return;
        setProfileHeadSha(headSha);
        const raw = profile.galleryItems;
        const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
        setItems(list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedItems = useMemo(
    () => items.toSorted((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
    [items],
  );

  const isEditDirty =
    editDraft !== null && editOriginal !== null && JSON.stringify(editDraft) !== editOriginal;

  const startEdit = (index: number) => {
    if (uploading || deleteSaving || editSaving) return;
    const item = sortedItems[index];
    if (!item) return;
    setEditIndex(index);
    const draft = { ...item };
    setEditDraft(draft);
    setEditOriginal(JSON.stringify(draft));
    setResult(null);
    setError(null);
  };

  const exitEdit = () => {
    if (editSaving) return;
    setEditIndex(null);
    setEditDraft(null);
    setEditOriginal(null);
  };

  const saveEdit = async () => {
    if (editDraft === null || editIndex === null || editSaving) return;

    setEditSaving(true);
    onPendingChange?.(true);
    setError(null);
    setResult(null);

    try {
      const nextItems = [...items];

      if (editIndex === -1) {
        nextItems.push(editDraft);
      } else {
        nextItems[editIndex] = editDraft;
      }

      if (!profileHeadSha) throw new Error('图库快照已失效，请重新加载后重试');
      const res = await saveProfileSection(
        'galleryItems',
        nextItems.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
        profileHeadSha,
      );

      const fresh = await loadProfileSnapshot();
      setProfileHeadSha(fresh.headSha);
      const raw = fresh.data.galleryItems;
      const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
      setItems(list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)));

      setResult(res);
      setEditIndex(null);
      setEditDraft(null);
      setEditOriginal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setEditSaving(false);
      onPendingChange?.(false);
    }
  };

  const requestDelete = (index: number) => {
    if (uploading || deleteSaving || editSaving) return;
    setDeleteIndex(index);
  };

  const confirmDelete = async () => {
    if (deleteIndex === null || deleteSaving) return;
    setDeleteSaving(true);
    onPendingChange?.(true);

    setError(null);
    setResult(null);

    try {
      const nextItems = items.filter((_, i) => i !== deleteIndex);
      if (!profileHeadSha) throw new Error('图库快照已失效，请重新加载后重试');
      const res = await saveProfileSection('galleryItems', nextItems, profileHeadSha);

      const fresh = await loadProfileSnapshot();
      setProfileHeadSha(fresh.headSha);
      const raw = fresh.data.galleryItems;
      const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
      setItems(list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)));

      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleteIndex(null);
      setDeleteSaving(false);
      onPendingChange?.(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(false);
    setProjectImagePath(null);
    setCopiedImage(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || !r2Credentials || uploading || deleteSaving) return;

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);
    if (
      !allowedTypes.has(selectedFile.type) ||
      !fileExtension ||
      !allowedExtensions.has(fileExtension) ||
      selectedFile.size > 50 * 1024 * 1024
    ) {
      setUploadError('仅支持 JPG、PNG、WebP 图片，且文件不得超过 50MB');
      return;
    }

    setUploading(true);
    onPendingChange?.(true);
    setUploadError(null);
    setUploadSuccess(false);
    setProjectImagePath(null);
    setResult(null);
    setError(null);

    try {
      const derivative = await generateImageDerivative(selectedFile);
      const originalExt = getOriginalExt(selectedFile.name);
      const derivExt = deriveExt(derivative.format);
      const baseStem = makeStem(selectedFile.name) || makeDefaultStem();
      const stem = await allocateStem(r2Credentials, folder, baseStem, originalExt, derivExt);

      const prefix = r2KeyPrefix(folder);
      const uploads: { key: string; body: Blob; contentType: string }[] = [];

      if (folder === 'projects') {
        uploads.push({
          key: `${prefix}/${stem}.${derivExt}`,
          body: derivative.display,
          contentType: derivative.format === 'webp' ? 'image/webp' : 'image/jpeg',
        });
      } else {
        uploads.push({
          key: `${prefix}/${stem}.${originalExt}`,
          body: selectedFile,
          contentType: selectedFile.type || 'application/octet-stream',
        });
        uploads.push({
          key: `${prefix}/${stem}-display.${derivExt}`,
          body: derivative.display,
          contentType: derivative.format === 'webp' ? 'image/webp' : 'image/jpeg',
        });
      }

      await putObjectsWithRollback(r2Credentials, uploads);

      if (folder === 'projects') {
        const imagePath = canonicalUploadPath(folder, stem, derivExt);
        setProjectImagePath(imagePath);
        writeJsonStorage(STORAGE_KEYS.adminPendingProjectImage, { image: imagePath });
      } else {
        const maxOrder = Math.max(
          0,
          ...items.map((item) => (typeof item.order === 'number' ? item.order : 0)),
        );
        const draftItem = buildDraftItem(
          folder,
          stem,
          originalExt,
          derivExt,
          derivative,
          maxOrder + 1,
        );

        setEditIndex(-1);
        setEditDraft(draftItem);
        setEditOriginal(JSON.stringify(draftItem));
      }

      setUploadSuccess(true);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      onPendingChange?.(false);
    }
  };

  const copyProjectImage = async () => {
    if (!projectImagePath) return;
    try {
      await navigator.clipboard.writeText(projectImagePath);
      if (!mounted.current) return;
      setCopiedImage(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <ThinkingState dark label="LOADING" />
      </div>
    );
  }

  if (editDraft !== null && editIndex !== null) {
    return (
      <fieldset
        disabled={editSaving}
        className="m-0 min-w-0 border-0 p-0 space-y-4"
        aria-busy={editSaving}
      >
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={exitEdit}>
            ← 返回列表
          </Button>
          <span className="text-sm text-zinc-500">
            {editIndex === -1 ? '新建条目' : '编辑条目'}
          </span>
        </div>

        <Card>
          <SchemaForm
            schema={GALLERY_FIELDS}
            value={editDraft}
            onChange={(next) => setEditDraft(next)}
          />
        </Card>

        {error && <p className="text-sm text-red-300">{error}</p>}

        {uploadSuccess && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
            已上传到 R2，CDN 缓存生效可能需数秒。
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
            已推送到 main，EdgeOne 正在自动部署，约 1-2 分钟后线上生效。
            <a href={result.htmlUrl} target="_blank" rel="noreferrer" className="ml-2 underline">
              查看 commit
            </a>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={exitEdit}>
            取消
          </Button>
          <Button variant="primary" onClick={saveEdit} disabled={!isEditDirty || editSaving}>
            {editSaving ? <Spinner className="mr-2" /> : null}
            保存条目
          </Button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset
      disabled={uploading || deleteSaving}
      className="m-0 min-w-0 border-0 p-0 space-y-5"
      aria-busy={uploading || deleteSaving}
    >
      <Card>
        <h3 className="text-base font-semibold text-zinc-100 mb-4">上传新照片</h3>

        <div className="space-y-4">
          {!canUpload && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              未配置 R2 凭据，图片无法直传到对象存储。请返回登录页填写 R2 endpoint、accessKeyId 与
              secretAccessKey。
            </div>
          )}

          <FieldRow label="目标文件夹">
            <Select
              value={folder}
              options={FOLDER_OPTIONS}
              onChange={(v) => {
                setFolder(v as ImageFolder);
                setProjectImagePath(null);
                setUploadError(null);
              }}
            />
          </FieldRow>

          <FieldRow label="选择图片">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                {selectedFile ? '更换图片' : '选择图片'}
              </Button>
              {selectedFile && (
                <span className="text-sm text-zinc-400 truncate max-w-[200px]">
                  {selectedFile.name}
                </span>
              )}
            </div>
          </FieldRow>

          {uploadError && <p className="text-sm text-red-300">{uploadError}</p>}

          {projectImagePath && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200 space-y-3">
              <p>已上传到 R2，CDN 缓存生效可能需数秒。</p>
              <div>
                <p className="text-xs text-sky-300/80 mb-1">主图</p>
                <code className="block break-all text-zinc-200">{projectImagePath}</code>
                <div className="mt-1">
                  <Button variant="ghost" onClick={copyProjectImage}>
                    {copiedImage ? '已复制' : '复制主图链接'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={!selectedFile || uploading || !canUpload}
            >
              {uploading ? <Spinner className="mr-2" /> : null}
              上传
            </Button>
          </div>
        </div>
      </Card>

      {result && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
          已推送到 main，EdgeOne 正在自动部署，约 1-2 分钟后线上生效。
          <a href={result.htmlUrl} target="_blank" rel="noreferrer" className="ml-2 underline">
            查看 commit
          </a>
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">图库条目</h3>

        {sortedItems.length === 0 && (
          <EmptyState description="暂无图库条目，可上传新照片后自动创建" />
        )}

        {sortedItems.map((item, index) => {
          const src = (item.imageSrc as string | undefined) || '';

          return (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-zinc-900/50"
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-3 min-w-0 text-left cursor-pointer"
                onClick={() => startEdit(index)}
              >
                {src ? (
                  <img
                    src={resolveImageSrc(src)}
                    alt={(item.imageAlt as string) || ''}
                    loading="lazy"
                    className="w-16 h-16 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-zinc-800 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-zinc-200 truncate">
                    {(item.title as string) || '未命名'}
                  </p>
                  <p className="text-sm text-zinc-500 truncate">
                    {(item.location as string) || '未知地点'} · 排序 {String(item.order ?? '-')}
                  </p>
                </div>
              </button>

              <Button variant="danger" onClick={() => requestDelete(index)} className="shrink-0">
                删除
              </Button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleteIndex !== null}
        title="删除图库条目"
        description="此操作只从 galleryItems 列表中移除该条目，图片文件仍保留在仓库中，是否继续？"
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleteSaving) setDeleteIndex(null);
        }}
      />
    </fieldset>
  );
}
