import { describe, expect, it, vi } from 'vite-plus/test';
import { diagnosticsApp } from './diagnostics.app';
import { appTestFixture } from '../testing/app-test-fixture';
const fixture = () => {
  const c = appTestFixture(diagnosticsApp, { reducedMotion: true }, { x: 0, y: 0, w: 470, h: 256 });
  return { ...c, frame: (key?: string, typed?: string) => c.send({ key, typed }) };
};

describe('Diagnostics L1 client', () => {
  it('renders every client label in DOS with no GUI status bar', async () => {
    const c = fixture();
    c.frame();
    expect(c.session.status()).toBeUndefined();
    expect(vi.mocked(c.text).mock.calls.every((call) => call[3]?.font === 'dos')).toBe(true);
    expect(
      vi
        .mocked(c.text)
        .mock.calls.some(([value]) => String(value).includes('DIAGNOSTIC TERMINAL READY')),
    ).toBe(true);
  });

  it('executes accepted console input and switches complete views with function keys', async () => {
    const c = fixture();
    c.frame('Enter', 'whoami');
    expect(vi.mocked(c.text).mock.calls.some(([value]) => value === 'HUMAN')).toBe(true);
    vi.mocked(c.text).mockClear();
    c.frame('F3');
    expect(vi.mocked(c.text).mock.calls.some(([value]) => value === 'LOCAL SIGNAL')).toBe(true);
    expect(vi.mocked(c.text).mock.calls.every((call) => call[3]?.font === 'dos')).toBe(true);
    vi.mocked(c.text).mockClear();
    c.frame('F4');
    expect(vi.mocked(c.text).mock.calls.some(([value]) => String(value).includes('MHKERNEL'))).toBe(
      true,
    );
    c.frame('F5');
    expect(c.env.open).toHaveBeenCalledWith('recovery');
  });
});
