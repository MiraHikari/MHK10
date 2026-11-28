import { PROFILE_JSON_PATH } from '@/admin/config';
import { commitFiles, getBranchHeadSha, getTextFile } from '@/admin/github/store';

export interface ProfileSnapshot {
  data: Record<string, unknown>;
  headSha: string;
}

export async function loadProfileSnapshot(): Promise<ProfileSnapshot> {
  const headSha = await getBranchHeadSha();
  const raw = await getTextFile(PROFILE_JSON_PATH, headSha);
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('profile.json 必须是 JSON 对象');
  }
  return { data: parsed as Record<string, unknown>, headSha };
}

export async function loadProfile(): Promise<Record<string, unknown>> {
  return (await loadProfileSnapshot()).data;
}

export async function saveProfileSection(
  section: string,
  value: unknown,
  expectedHeadSha?: string,
): Promise<{ commitSha: string; htmlUrl: string }> {
  const headSha = expectedHeadSha ?? (await getBranchHeadSha());
  const raw = await getTextFile(PROFILE_JSON_PATH, headSha);
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('profile.json 必须是 JSON 对象');
  }
  const draft = { ...parsed } as Record<string, unknown>;

  draft[section] = value;

  const text = JSON.stringify(draft, null, 2) + '\n';

  return commitFiles(`content(profile): update ${section}`, [{ path: PROFILE_JSON_PATH, text }], {
    expectedHeadSha: headSha,
  });
}
