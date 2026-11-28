import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

// 模块是模块级单例（state/generation/chunks 均为模块级变量），
// 每个用例 vi.resetModules() + 动态 import 获得全新实例。
// mock 掉 react：node 环境无需真正加载 React，仅保证模块可解析。
vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));

class MockUtterance {
  text: string;
  voice: unknown = null;
  lang = '';
  rate = 1;
  pitch = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

interface MockSynth {
  speaking: boolean;
  pending: boolean;
  utterances: MockUtterance[];
  getVoices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
}

/**
 * 模拟最坏情况：cancel() 同步派发当前 utterance 的 onerror（canceled）。
 * 真实浏览器多数异步派发，同步派发才能暴露「generation 递增晚于 cancel」的竞态。
 */
function createMockSynth(): MockSynth {
  const utterances: MockUtterance[] = [];
  let current: MockUtterance | null = null;
  return {
    speaking: false,
    pending: false,
    utterances,
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(() => {
      const u = current;
      current = null;
      if (u?.onerror) u.onerror({ error: 'canceled' });
    }),
    speak: vi.fn((utterance: MockUtterance) => {
      utterances.push(utterance);
      current = utterance;
      utterance.onstart?.();
    }),
  };
}

function createParagraphElement(text: string): Record<string, unknown> {
  return {
    tagName: 'P',
    textContent: text,
    children: [],
    contains: () => false,
    classList: { add: vi.fn(), remove: vi.fn() },
    getBoundingClientRect: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
    }),
    scrollIntoView: vi.fn(),
  };
}

/** `.prose-mh` 容器：两个带文本的 P 子元素 → buildChunks 产出 2 个朗读块。 */
function createProseContainer(): Record<string, unknown> {
  return {
    tagName: 'DIV',
    textContent: '',
    children: [createParagraphElement('第一段'), createParagraphElement('第二段')],
    contains: () => true,
    classList: { add: vi.fn(), remove: vi.fn() },
    getBoundingClientRect: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
    }),
    scrollIntoView: vi.fn(),
  };
}

type SpeechModule = typeof import('@/hooks/blog/useArticleSpeech');

let mod: SpeechModule;
let synth: MockSynth;
let windowStub: Record<string, unknown>;

beforeEach(async () => {
  vi.resetModules();
  synth = createMockSynth();
  windowStub = {
    speechSynthesis: synth,
    dispatchEvent: vi.fn(),
    getSelection: vi.fn(() => null),
    matchMedia: vi.fn(() => ({ matches: false })),
    innerHeight: 800,
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  };
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', {
    querySelector: vi.fn((sel: string) => (sel === '.prose-mh' ? createProseContainer() : null)),
  });
  mod = await import('@/hooks/blog/useArticleSpeech');
});

afterEach(() => {
  mod?.disposeSpeech();
  vi.unstubAllGlobals();
});

describe('useArticleSpeech speak 代际竞态', () => {
  it('keeps disposed full-article callbacks from restarting the speech state', () => {
    mod.speak();
    const old = synth.utterances[0];
    mod.disposeSpeech();
    old.onstart?.();
    old.onend?.();
    expect(mod.getSpeechState()).toBe('idle');
    expect(synth.utterances).toHaveLength(1);
  });
  it('ignores late selection callbacks and releases the voice listener on dispose', () => {
    mod.speak('旧选区');
    const old = synth.utterances[0];
    mod.speak('新选区');
    old.onend?.();
    expect(mod.getSpeechState()).toBe('speaking');
    const listener = synth.addEventListener.mock.calls[0][1];
    mod.disposeSpeech();
    expect(synth.removeEventListener).toHaveBeenCalledWith('voiceschanged', listener);
    old.onstart?.();
    expect(mod.getSpeechState()).toBe('idle');
    mod.speak('重挂载');
    expect(synth.addEventListener).toHaveBeenCalledTimes(2);
  });
  it('cancel 同步派发 onerror 时，新 speak 不会让旧朗读链继续推进', () => {
    // 全文朗读：chunk 0 的 utterance 入队（同步 onstart → speaking）。
    mod.speak();
    expect(synth.utterances).toHaveLength(1);
    expect(mod.getSpeechState()).toBe('speaking');

    // 第二次 speak 触发 cancel：旧 chunk 0 的 onerror 同步执行，
    // 其 advance 闭包内的 gen 已过期（speak 入口先递增 generation），不得再 speakChunk(1)。
    mod.speak('新文本');

    // 只有旧 chunk0 + 新选段两条 utterance；旧 chunk1 不应叠加。
    expect(synth.utterances).toHaveLength(2);
    expect(synth.utterances[1].text).toBe('新文本');
  });

  it('stopSpeech 后再 speak，状态机与朗读链正常', () => {
    mod.speak();
    expect(mod.getSpeechState()).toBe('speaking');
    expect(synth.utterances).toHaveLength(1);

    // stop 先递增 generation 再 cancel（同步 onerror 被拦截，不推进 chunk1）。
    mod.stopSpeech();
    expect(mod.getSpeechState()).toBe('idle');
    expect(synth.utterances).toHaveLength(1);

    mod.speak('再次朗读');
    expect(mod.getSpeechState()).toBe('speaking');
    expect(synth.utterances).toHaveLength(2);
    expect(synth.utterances[1].text).toBe('再次朗读');
  });

  it('存在选区时 speak 走选段朗读', () => {
    (windowStub.getSelection as ReturnType<typeof vi.fn>).mockReturnValue({
      anchorNode: {},
      toString: () => '选中文字',
    });

    mod.speak();

    expect(synth.utterances).toHaveLength(1);
    expect(synth.utterances[0].text).toBe('选中文字');
  });

  it('空白文本 speak 等价于 stop：取消旧链且不启动新朗读', () => {
    mod.speak();
    expect(synth.utterances).toHaveLength(1);

    mod.speak('   ');
    // 旧链被 cancel 且同步 onerror 被 generation 拦截；无新 utterance。
    expect(synth.utterances).toHaveLength(1);
    expect(mod.getSpeechState()).toBe('idle');
  });
});
