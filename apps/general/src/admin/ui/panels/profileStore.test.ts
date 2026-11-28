import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
const repository = vi.hoisted(() => ({ head: vi.fn(), read: vi.fn(), commit: vi.fn() }));
vi.mock('@/admin/github/store', () => ({
  getBranchHeadSha: repository.head,
  getTextFile: repository.read,
  commitFiles: repository.commit,
}));
import { loadProfileSnapshot, saveProfileSection } from './profileStore';
import { PROFILE_JSON_PATH } from '@/admin/config';

beforeEach(() => {
  vi.clearAllMocks();
  repository.head.mockResolvedValue('snapshot');
  repository.read.mockResolvedValue('{"profile":{"name":"MiraHikari"},"galleryItems":[]}');
  repository.commit.mockResolvedValue({ commitSha: 'next', htmlUrl: '' });
});
describe('profile snapshot writes', () => {
  it('reads the content at exactly the returned head', async () => {
    expect((await loadProfileSnapshot()).headSha).toBe('snapshot');
    expect(repository.read).toHaveBeenCalledWith(PROFILE_JSON_PATH, 'snapshot');
  });
  it('saves from the editor snapshot and requires the same head at commit', async () => {
    await saveProfileSection('galleryItems', [{ title: 'Photo' }], 'editor-head');
    expect(repository.read).toHaveBeenCalledWith(PROFILE_JSON_PATH, 'editor-head');
    expect(repository.head).not.toHaveBeenCalled();
    const [, files, options] = repository.commit.mock.calls[0];
    expect(JSON.parse(files[0].text)).toEqual({
      profile: { name: 'MiraHikari' },
      galleryItems: [{ title: 'Photo' }],
    });
    expect(options).toEqual({ expectedHeadSha: 'editor-head' });
  });
  it('pins even legacy callers to a snapshot and rejects arrays', async () => {
    await saveProfileSection('galleryItems', []);
    expect(repository.commit.mock.calls[0][2]).toEqual({ expectedHeadSha: 'snapshot' });
    repository.read.mockResolvedValue('[]');
    await expect(loadProfileSnapshot()).rejects.toThrow('JSON 对象');
    await expect(saveProfileSection('profile', {})).rejects.toThrow('JSON 对象');
  });
});
