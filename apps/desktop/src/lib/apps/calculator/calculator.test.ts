import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { calculatorApp } from './calculator.app';
import { appTestFixture } from '../testing/app-test-fixture';

const setup = () => {
  const c = appTestFixture(calculatorApp, {}, { x: 0, y: 0, w: 216, h: 176 });
  return {
    ...c,
    queue: c.input.queueInput,
    input: (typed?: string, key?: string) => c.send({ typed, key }),
  };
};
afterEach(() => vi.unstubAllGlobals());

describe('Calculator session input and clipboard lifetime', () => {
  it('preserves clear, text, function-key and editing order within a single frame', () => {
    const { session, input, queue } = setup();
    input('123');
    queue({ key: 'Escape' });
    queue({ typed: '81' });
    input(undefined, 'F8');
    expect(session.status()).toContain('| 9');
    queue({ key: 'Delete' });
    queue({ typed: '12' });
    queue({ key: 'Backspace' });
    input('+9=');
    expect(session.status()).toBe('1 + 9 = | 10');
    queue({ typed: '27' });
    input(undefined, 'Escape');
    expect(session.status()).toBe('Standard | 0');
    session.dispose();
  });
  it('consumes every digit in a batched frame and supports memory shortcuts', () => {
    const { session, input } = setup();
    input('12+3=');
    expect(session.status()).toBe('12 + 3 = | 15');
    input('m');
    input('c');
    input('i');
    expect(session.status()).toContain('| 15');
    session.dispose();
  });

  it('handles clipboard rejection without unhandled promises or losing the calculation', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
        readText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    const { session, input } = setup();
    input('42');
    input(undefined, 'Copy');
    await vi.waitFor(() => expect(session.status()).toBe('Copied result.'));
    input(undefined, 'Paste');
    await vi.waitFor(() => expect(session.status()).toBe('Pasted number.'));
    input('+8=');
    expect(session.status()).toBe('42 + 8 = | 50');
    session.dispose();
  });

  it('does not apply a delayed paste over newer input', async () => {
    let finish!: (value: string) => void;
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      },
    });
    const { session, input } = setup();
    input('4');
    input(undefined, 'Paste');
    input('2');
    finish('999');
    await vi.waitFor(() => expect(session.status()).toBe('Paste skipped: calculation changed.'));
    input('+8=');
    expect(session.status()).toBe('42 + 8 = | 50');
    session.dispose();
  });

  it('ignores clipboard completion after disposal and remounts with clean state', async () => {
    let finish!: (value: string) => void;
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      },
    });
    const first = setup();
    first.input(undefined, 'Paste');
    first.session.dispose();
    first.session.dispose();
    const second = setup();
    second.input('7');
    finish('999');
    await Promise.resolve();
    await Promise.resolve();
    expect(second.session.status()).toBe('Standard | 7');
    second.session.dispose();
  });
});
