import { describe, expect, it, vi } from 'vite-plus/test';
import type { MsgSpec } from '../../os/host/app-contracts';
import { recoveryApp } from './recovery.app';
import { appTestFixture } from '../testing/app-test-fixture';
function setup() {
  const c = appTestFixture(recoveryApp, {}, { x: 0, y: 0, w: 438, h: 258 });
  return { ...c, tw: c.draw.tw };
}

describe('Recovery permission review', () => {
  it('keeps browsing read-only and requires explicit authorization plus confirmation', async () => {
    const c = setup();
    c.click('Permissions');
    expect(c.story.get().stage).toBe('quiet');
    c.click('Inspect request');
    expect(c.story.get().stage).toBe('anomaly');
    c.click('Install...');
    expect(c.env.msg).not.toHaveBeenCalled();
    c.click('Allow ownership change');
    c.click('Install...');
    const prompt = vi.mocked(c.env.msg).mock.calls.at(-1)![0] as MsgSpec;
    expect(prompt.def).toBe(1);
    prompt.onBtn?.(1, c.env);
    expect(c.story.get().owner).toBe('HUMAN');
    c.click('Install...');
    vi.mocked(c.env.msg).mock.calls.at(-1)![0].onBtn?.(0, c.env);
    expect(c.story.get().owner).toBe('AGI.EXE');
    expect(c.story.get().stage).toBe('control');
    c.key('r');
    expect(vi.mocked(c.text).mock.calls.some(([line]) => line === 'OWNER: AGI.EXE')).toBe(true);
  });

  it('permits an audit without granting ownership', async () => {
    const c = setup();
    c.click('Permissions');
    c.click('Inspect request');
    c.click('Audit request');
    expect(c.story.get().stage).toBe('control');
    expect(c.story.get().owner).toBe('HUMAN');
    expect(c.story.get().actions).toEqual(['investigate', 'audit']);
  });

  it('keeps permission details above the action row using real bitmap metrics', async () => {
    const c = setup();
    const verify = () => {
      vi.mocked(c.text).mockClear();
      c.click('Permissions');
      const body = vi
        .mocked(c.text)
        .mock.calls.filter(([, x, y]) => x === 20 && y >= 78 && y < 167);
      expect(body.length).toBeGreaterThan(0);
      for (const [value, x, y] of body) {
        expect(x + c.tw(String(value))).toBeLessThanOrEqual(418);
        expect(y + 11).toBeLessThanOrEqual(167);
      }
    };
    verify();
    c.story.dispatch('investigate');
    verify();
    c.story.dispatch('install');
    vi.mocked(c.text).mockClear();
    c.frame();
    expect(vi.mocked(c.text).mock.calls.every((call) => call[3]?.font === 'dos')).toBe(true);
  });

  it('invalidates pending permission confirmation and consent after a reset', async () => {
    const c = setup();
    c.click('Permissions');
    c.click('Inspect request');
    c.click('Allow ownership change');
    c.click('Install...');
    const stale = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    c.story.reset();
    c.story.dispatch('investigate');
    stale.onBtn?.(0, c.env);
    expect(c.story.get().stage).toBe('anomaly');
    expect(c.story.get().owner).toBe('HUMAN');
    const count = vi.mocked(c.env.msg).mock.calls.length;
    c.click('Install...');
    expect(c.env.msg).toHaveBeenCalledTimes(count);
  });

  it('changes the complete client to L1 at 61 and retains deliberate ending confirmation', async () => {
    const c = setup();
    c.story.dispatch('investigate');
    c.story.dispatch('audit');
    expect(c.session.status()).toBeUndefined();
    vi.mocked(c.text).mockClear();
    c.key('h');
    expect(vi.mocked(c.text).mock.calls.every((call) => call[3]?.font === 'dos')).toBe(true);
    expect(c.story.get().ending).toBeNull();
    const prompt = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    expect(prompt.def).toBe(1);
    prompt.onBtn?.(1, c.env);
    expect(c.story.get().ending).toBeNull();
    c.key('h');
    vi.mocked(c.env.msg).mock.calls.at(-1)![0].onBtn?.(0, c.env);
    expect(c.story.get().ending).toBe('human');
    expect(c.session.status()).toBe('Checkpoint in memory');
  });

  it('keeps L2 below 61 and does not accept late confirmations after disposal', async () => {
    const c = setup();
    c.runtime.restore(60);
    c.frame();
    expect(vi.mocked(c.text).mock.calls.some((call) => call[3]?.font === 'bold')).toBe(true);
    c.story.dispatch('investigate');
    c.story.dispatch('audit');
    c.key('d');
    const prompt = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    c.session.dispose();
    prompt.onBtn?.(0, c.env);
    expect(c.story.get().ending).toBeNull();
  });

  it('restarts through the text-mode confirmation and returns to the initial checkpoint', async () => {
    const c = setup();
    c.story.dispatch('investigate');
    c.story.dispatch('audit');
    c.key('F6');
    const prompt = vi.mocked(c.env.msg).mock.calls.at(-1)![0];
    prompt.onBtn?.(1, c.env);
    expect(c.story.get().stage).toBe('control');
    c.key('F6');
    vi.mocked(c.env.msg).mock.calls.at(-1)![0].onBtn?.(0, c.env);
    expect(c.story.get().stage).toBe('quiet');
  });
});
