import { useSyncExternalStore } from 'react';
import { effectiveReducedMotion } from '@/hooks/useMotionPreference';

/**
 * 文章 TTS 朗读（模块级单例，避免多个组件竞争同一份 speechSynthesis）。
 *
 * 全文朗读按段落分块：每段一个 utterance，天然拿到「当前读到第几段」，
 * 对当前块做 `.reading-live` 高亮 + 视口外自动跟随。不依赖 boundary 事件
 * 做位置回显（跨浏览器/语音引擎不可靠，Firefox 不触发、部分引擎无
 * charIndex）。选段朗读仍是单 utterance（无位置回显）。
 *
 * 跨 agent 契约：状态每次变更时派发 `portfolio:tts-speaking` 自定义事件，
 * `detail.speaking = 当前正在发声（speaking 状态）`；暂停与停止都发 false。
 * 另一 agent 在 App 层监听该事件暂停背景音乐。这里只负责发事件。
 *
 * SSR 安全：`typeof window === 'undefined'` 或浏览器无 speechSynthesis 时
 * 所有操作 no-op；`speechSynthesisSupported()` 供按钮禁用判断。
 */

export type SpeechState = 'idle' | 'speaking' | 'paused';

export const TTS_EVENT = 'portfolio:tts-speaking';

/** 单段/选段朗读上限：超长裁剪，避免一次性塞给合成器。 */
const MAX_TEXT_CHARS = 20000;

export interface LiveChunk {
  readonly index: number;
  readonly total: number;
}

const listeners = new Set<() => void>();
const liveListeners = new Set<() => void>();
let state: SpeechState = 'idle';
let live: LiveChunk | null = null;
/** undefined 表示尚未解析过 voice。 */
let cachedVoice: SpeechSynthesisVoice | null | undefined;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let voicesOwner: SpeechSynthesis | undefined;
let onVoicesChanged: (() => void) | undefined;
/** 每轮 speak/stop 递增：异步回调里比对，防旧一轮的 end 串到新一轮。
 * speak() 入口统一递增（先于 synth.cancel()，避免同步派发的 onerror 放行旧链）。 */
let generation = 0;
const advanceTimers = new Set<number>();
function clearAdvanceTimers(): void {
  advanceTimers.forEach((timer) => window.clearTimeout(timer));
  advanceTimers.clear();
}
let chunks: HTMLElement[] = [];
/** 最近一个已开始朗读的块索引（-1 = 尚未开始）。 */
let chunkIndex = -1;
/** 当前带 `.reading-live` 高亮的块；只会有至多一个，直接跟踪免去全文档查询。 */
let liveElement: HTMLElement | null = null;

function setState(next: SpeechState): void {
  if (state === next) return;
  state = next;
  listeners.forEach((listener) => listener());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(TTS_EVENT, { detail: { speaking: state === 'speaking' } }),
    );
  }
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function getSynth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : undefined;
}

/** 优先本地微软系中文语音，降级任意 zh，最后兜底 null。 */
function pickChineseVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  const chinese = voices.filter((voice) => voice.lang.toLowerCase().startsWith('zh'));
  if (chinese.length === 0) return null;
  const nonGoogle = chinese.filter((voice) => !/google/i.test(voice.name));
  return nonGoogle[0] ?? chinese[0];
}

function resolveVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  cachedVoice = pickChineseVoice(synth);
  return cachedVoice;
}

function bindVoicesChanged(synth: SpeechSynthesis): void {
  if (voicesOwner === synth) return;
  if (voicesOwner && onVoicesChanged)
    voicesOwner.removeEventListener('voiceschanged', onVoicesChanged);
  voicesOwner = synth;
  onVoicesChanged = () => {
    cachedVoice = undefined;
    const voice = resolveVoice(synth);
    // 朗读中换 voice：仅对当前 utterance 轻量重选，不打断播放。
    if (state === 'speaking' && currentUtterance && voice) {
      currentUtterance.voice = voice;
      currentUtterance.lang = voice.lang;
    }
  };
  synth.addEventListener('voiceschanged', onVoicesChanged);
}

/** 当前选区（锚点在 .prose-mh 内）的文本；无选区返回 null。 */
export function currentProseSelection(): string | null {
  const selection = window.getSelection();
  const prose = document.querySelector('.prose-mh');
  if (!selection || !prose?.contains(selection.anchorNode)) return null;
  const excerpt = selection.toString().trim();
  return excerpt ? excerpt.slice(0, MAX_TEXT_CHARS) : null;
}

/** 作为朗读单元的块级标签。 */
const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'FIGURE',
]);

/**
 * 正文块级子元素作为朗读单元：p / 标题 / li / blockquote / pre 等。
 * direct-load 路径正文在 `<astro-slot>` 包装层内，SPA 路径是扁平结构——
 * 当子元素只是单一包装（非块级标签）且内含多个块级元素时下钻一层。
 */
function buildChunks(container: HTMLElement): HTMLElement[] {
  const chunks: HTMLElement[] = [];
  for (const child of Array.from(container.children)) {
    if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'TEMPLATE') {
      continue;
    }
    const blockChildren = Array.from(child.children).filter((grand) =>
      BLOCK_TAGS.has(grand.tagName),
    );
    if (blockChildren.length > 1 && !BLOCK_TAGS.has(child.tagName)) {
      chunks.push(...(blockChildren as HTMLElement[]));
    } else if ((child.textContent ?? '').trim()) {
      chunks.push(child as HTMLElement);
    }
  }
  return chunks;
}

function clearLiveMark(): void {
  liveElement?.classList.remove('reading-live');
  liveElement = null;
}

function markLiveChunk(el: HTMLElement, index: number, total: number): void {
  clearLiveMark();
  el.classList.add('reading-live');
  liveElement = el;
  live = { index, total };
  liveListeners.forEach((listener) => listener());
  // 视口外自动跟随；reduced-motion 下不做平滑滚动。
  const rect = el.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) {
    el.scrollIntoView({ block: 'center', behavior: effectiveReducedMotion() ? 'auto' : 'smooth' });
  }
}

function clearLive(): void {
  clearLiveMark();
  live = null;
  liveListeners.forEach((listener) => listener());
}

function createUtterance(
  text: string,
  voice: SpeechSynthesisVoice | null,
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'zh-CN';
  }
  utterance.rate = 1;
  utterance.pitch = 1;
  return utterance;
}

function speakChunk(
  synth: SpeechSynthesis,
  voice: SpeechSynthesisVoice | null,
  index: number,
): void {
  const gen = generation;
  if (index >= chunks.length) {
    setState('idle');
    clearLive();
    return;
  }
  const el = chunks[index];
  const text = (el.textContent ?? '').trim();
  // 暂停落在块间隙：chunkIndex 保持上一个已读块，resume 时从 index 继续。
  if (state === 'paused') return;
  chunkIndex = index;
  if (!text) {
    const timer = window.setTimeout(() => {
      advanceTimers.delete(timer);
      if (gen === generation) speakChunk(synth, voice, index + 1);
    }, 0);
    advanceTimers.add(timer);
    return;
  }
  markLiveChunk(el, index, chunks.length);
  const utterance = createUtterance(text.slice(0, MAX_TEXT_CHARS), voice);
  const advance = () => {
    if (gen === generation) speakChunk(synth, voice, index + 1);
  };
  utterance.onstart = () => {
    if (gen === generation) setState('speaking');
  };
  utterance.onend = advance;
  utterance.onerror = advance;
  currentUtterance = utterance;
  synth.speak(utterance);
}

function startArticleReading(synth: SpeechSynthesis): void {
  const prose = document.querySelector<HTMLElement>('.prose-mh');
  if (!prose) return;
  chunks = buildChunks(prose);
  if (chunks.length === 0) return;
  bindVoicesChanged(synth);
  chunkIndex = -1;
  setState('speaking');
  speakChunk(synth, resolveVoice(synth), 0);
}

/** 选段朗读：单 utterance，不维护分块位置。 */
function speakSelection(synth: SpeechSynthesis, text: string): void {
  bindVoicesChanged(synth);
  chunks = [];
  chunkIndex = -1;
  clearLive();
  const utterance = createUtterance(text, resolveVoice(synth));
  const acceptedGeneration = generation;
  utterance.onstart = () => {
    if (acceptedGeneration === generation) setState('speaking');
  };
  const complete = () => {
    if (acceptedGeneration === generation) setState('idle');
  };
  utterance.onend = complete;
  utterance.onerror = complete;
  currentUtterance = utterance;
  synth.speak(utterance);
}

/** 朗读入口：传入 text 则朗读该文本；否则有选区读选区，无选区读全文。 */
export function speak(text?: string): void {
  const synth = getSynth();
  if (!synth) return;
  // 先递增代际再 cancel：若浏览器同步派发被取消 utterance 的 onerror（canceled），
  // 旧朗读链的 advance 会因 gen === generation 仍成立而继续 speakChunk，造成新旧叠加。
  generation += 1;
  clearAdvanceTimers();
  synth.cancel();
  if (text) {
    const content = text.trim();
    if (content) {
      speakSelection(synth, content.slice(0, MAX_TEXT_CHARS));
    } else {
      // 空白文本：cancel 已停掉旧朗读，但没有任何新 utterance 在播——
      // 必须复位状态，否则 UI 卡在「朗读中」（与 stopSpeech 同款复位）。
      currentUtterance = null;
      clearLive();
      setState('idle');
    }
    return;
  }
  const selection = currentProseSelection();
  if (selection) {
    speakSelection(synth, selection);
    return;
  }
  startArticleReading(synth);
}

export function pauseSpeech(): void {
  const synth = getSynth();
  if (!synth || state !== 'speaking') return;
  synth.pause();
  setState('paused');
}

export function resumeSpeech(): void {
  const synth = getSynth();
  if (!synth || state !== 'paused') return;
  synth.resume();
  setState('speaking');
  // 暂停落在块间隙（无 utterance 在播）：手动从下一个块继续。
  if (!synth.speaking && chunkIndex + 1 < chunks.length) {
    speakChunk(synth, resolveVoice(synth), chunkIndex + 1);
  }
}

export function stopSpeech(): void {
  const synth = getSynth();
  if (!synth || state === 'idle') return;
  generation += 1;
  clearAdvanceTimers();
  synth.cancel();
  currentUtterance = null;
  clearLive();
  setState('idle');
}

/** 组件卸载 / 文章切换时调用：停止发声并复位。 */
export function disposeSpeech(): void {
  const synth = getSynth();
  generation += 1;
  clearAdvanceTimers();
  if (synth) synth.cancel();
  if (voicesOwner && onVoicesChanged)
    voicesOwner.removeEventListener('voiceschanged', onVoicesChanged);
  voicesOwner = undefined;
  onVoicesChanged = undefined;
  cachedVoice = undefined;
  currentUtterance = null;
  clearLive();
  if (state !== 'idle') setState('idle');
}

export function getSpeechState(): SpeechState {
  return state;
}

export function getLiveChunk(): LiveChunk | null {
  return live;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function subscribeLive(listener: () => void): () => void {
  liveListeners.add(listener);
  return () => {
    liveListeners.delete(listener);
  };
}

export function useSpeechState(): SpeechState {
  return useSyncExternalStore(subscribe, getSpeechState, () => 'idle');
}

export function useLiveChunk(): LiveChunk | null {
  return useSyncExternalStore(subscribeLive, getLiveChunk, () => null);
}
