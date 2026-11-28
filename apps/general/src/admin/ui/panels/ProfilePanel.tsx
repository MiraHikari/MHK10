/**
 * 个人资料面板：按节编辑 profile.json。
 * 图库节由 GalleryPanel 专门管理，此处过滤掉。
 */

import { useEffect, useState } from 'react';
import { Button, Card, ConfirmDialog, Spinner } from '@/admin/ui/primitives';
import { SchemaForm } from '@/admin/ui/SchemaForm';
import { PROFILE_SECTION_SCHEMAS, validateSchemaValue } from '@/admin/schema';
import { loadProfileSnapshot, saveProfileSection } from '@/admin/ui/panels/profileStore';
import ThinkingState from '@/components/ui/ThinkingState';

interface SectionEntry {
  key: string;
  label: string;
}

const SECTIONS: SectionEntry[] = Object.entries(PROFILE_SECTION_SCHEMAS)
  // 图库由 GalleryPanel 专门管理
  .filter(([key]) => key !== 'galleryItems')
  .map(([key, def]) => ({ key, label: def.label }));

function isWrappedSection(section: string): boolean {
  const def = PROFILE_SECTION_SCHEMAS[section];
  return def.schema.length === 1 && def.schema[0].key === section;
}

function buildDraft(
  section: string,
  profile: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!profile) return {};

  const value = profile[section];

  if (isWrappedSection(section)) {
    return { [section]: value };
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function ProfilePanel({
  onPendingChange,
}: { onPendingChange?: (pending: boolean) => void } = {}) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0]?.key ?? '');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ commitSha: string; htmlUrl: string } | null>(null);
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [profileHeadSha, setProfileHeadSha] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadProfileSnapshot()
      .then(({ data, headSha }) => {
        if (cancelled) return;
        setProfile(data);
        const initialSection = SECTIONS[0]?.key ?? '';
        setActiveSection(initialSection);
        const initialDraft = buildDraft(initialSection, data);
        setDraft(initialDraft);
        setOriginal(JSON.stringify(initialDraft));
        setProfileHeadSha(headSha);
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

  const activeDef = PROFILE_SECTION_SCHEMAS[activeSection];
  const isDirty = JSON.stringify(draft) !== original;

  const switchSection = (next: string) => {
    if (!profile) return;

    setActiveSection(next);
    setResult(null);
    setError(null);

    const nextDraft = buildDraft(next, profile);
    setDraft(nextDraft);
    setOriginal(JSON.stringify(nextDraft));
  };

  const requestSwitchSection = (next: string) => {
    if (saving) return;
    if (next === activeSection) return;

    if (isDirty) {
      setPendingSection(next);
      return;
    }

    switchSection(next);
  };

  const handleSave = async () => {
    if (!profile || saving) return;

    setSaving(true);
    onPendingChange?.(true);
    setError(null);
    setResult(null);

    try {
      const valueToSave = isWrappedSection(activeSection) ? draft[activeSection] : draft;
      const schemaErrors = activeDef
        ? validateSchemaValue(activeDef.schema, draft)
        : ['未知 profile 分区'];
      if (schemaErrors.length > 0) throw new Error(schemaErrors.join('；'));

      if (!profileHeadSha) throw new Error('profile 快照已失效，请刷新后重试');
      const res = await saveProfileSection(activeSection, valueToSave, profileHeadSha);

      const fresh = await loadProfileSnapshot();
      setProfile(fresh.data);
      setProfileHeadSha(fresh.headSha);

      const nextDraft = buildDraft(activeSection, fresh.data);
      setDraft(nextDraft);
      setOriginal(JSON.stringify(nextDraft));

      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
      onPendingChange?.(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <ThinkingState dark label="LOADING" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-10 text-center text-sm text-zinc-400">{error ?? '无法加载个人资料'}</div>
    );
  }

  return (
    <fieldset
      disabled={saving}
      className="m-0 min-w-0 border-0 p-0 flex flex-col sm:flex-row gap-4"
      aria-busy={saving}
    >
      {/* 移动端横向 chip 条 */}
      <div className="flex sm:hidden gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {SECTIONS.map((section) => {
          const active = section.key === activeSection;
          return (
            <Button
              key={section.key}
              variant="ghost"
              onClick={() => requestSwitchSection(section.key)}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-full ${
                active ? 'bg-white/10 text-zinc-100 border-sky-400/30' : 'text-zinc-400'
              }`}
            >
              {section.label}
              {active && isDirty ? ' ·' : ''}
            </Button>
          );
        })}
      </div>

      {/* 桌面端左侧列表 */}
      <div className="hidden sm:flex flex-col gap-1 w-56 shrink-0">
        {SECTIONS.map((section) => {
          const active = section.key === activeSection;
          return (
            <Button
              key={section.key}
              variant="ghost"
              onClick={() => requestSwitchSection(section.key)}
              className={`justify-start px-3 py-2 text-sm ${
                active ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'
              }`}
            >
              {section.label}
              {active && isDirty ? ' ·' : ''}
            </Button>
          );
        })}
      </div>

      {/* 右侧表单 */}
      <div className="flex-1 min-w-0 space-y-4">
        <Card>
          <h3 className="text-base font-semibold text-zinc-100 mb-4">
            {activeDef?.label ?? activeSection}
          </h3>

          <SchemaForm
            schema={activeDef?.schema ?? []}
            value={draft}
            onChange={(next) => setDraft(next)}
          />

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

          {result && (
            <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
              已推送到 main，EdgeOne 正在自动部署，约 1-2 分钟后线上生效。
              <a href={result.htmlUrl} target="_blank" rel="noreferrer" className="ml-2 underline">
                查看 commit
              </a>
            </div>
          )}
        </Card>

        <div className="flex justify-end">
          <Button variant="primary" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? <Spinner className="mr-2" /> : null}
            保存本节
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingSection !== null}
        title="未保存的修改"
        description="切换节会丢失当前未保存的修改，是否继续？"
        confirmText="继续"
        cancelText="取消"
        onConfirm={() => {
          if (saving) return;
          if (pendingSection) switchSection(pendingSection);
          setPendingSection(null);
        }}
        onCancel={() => {
          if (!saving) setPendingSection(null);
        }}
      />
    </fieldset>
  );
}
