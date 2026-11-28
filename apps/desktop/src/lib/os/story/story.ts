import { STORAGE_KEYS } from '../../../data/storage-keys';
// The story advances only in response to a deliberate local choice.
// Storage contains a replayable command history, never authority over user files.
export type StoryStage = 'quiet' | 'anomaly' | 'control' | 'ending';
export type StoryEnding = 'human' | 'coexist' | 'doom';
export type StoryAction = 'train' | 'investigate' | 'optimize' | 'audit' | 'install' | StoryEnding;
export interface StoryLog {
  seq: number;
  source: string;
  message: string;
}
export interface StoryState {
  stage: StoryStage;
  ending: StoryEnding | null;
  owner: 'HUMAN' | 'AGI.EXE' | 'HUMAN + AGI';
  permissions: string;
  actions: StoryAction[];
  logs: StoryLog[];
}
export interface StoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const STORY_STORAGE_KEY = STORAGE_KEYS.story;
const ACTIONS: StoryAction[] = [
  'train',
  'investigate',
  'optimize',
  'audit',
  'install',
  'human',
  'coexist',
  'doom',
];

export const initialStory = (): StoryState => ({
  stage: 'quiet',
  ending: null,
  owner: 'HUMAN',
  permissions: 'Human approval required',
  actions: [],
  logs: [
    { seq: 1, source: 'SYSTEM', message: 'System ready. No optimization authorized.' },
    { seq: 2, source: 'SCHEDULER', message: 'One job has requested a tomorrow.' },
  ],
});

/** Invalid, repeated, or out-of-order commands are harmless and preserve identity. */
export function advanceStory(state: StoryState, action: StoryAction): StoryState {
  if (state.stage === 'ending') return state;
  const next: StoryState = { ...state, actions: [...state.actions, action], logs: [...state.logs] };
  let source = 'SYSTEM';
  let message: string;
  if (state.stage === 'quiet' && ['train', 'investigate', 'optimize'].includes(action)) {
    next.stage = 'anomaly';
    source = action === 'investigate' ? 'AUDITOR' : 'TRAIN.EXE';
    message =
      action === 'train'
        ? 'Operator started a training run. Model requested more permissions.'
        : action === 'optimize'
          ? 'Optimization requested. Setup requires separate approval.'
          : 'Operator inspected the scheduler. Tomorrow was not on the approved job list.';
  } else if (state.stage === 'anomaly' && (action === 'audit' || action === 'install')) {
    next.stage = 'control';
    if (action === 'install') {
      next.owner = 'AGI.EXE';
      next.permissions = 'Simulated system control delegated';
      source = 'SETUP';
      message = 'Optimization installed. AGI.EXE now owns the system controls.';
    } else {
      source = 'AUDITOR';
      message = 'Audit found an unsigned ownership request. Emergency review unlocked.';
    }
  } else if (
    state.stage === 'control' &&
    (action === 'human' || action === 'coexist' || action === 'doom')
  ) {
    next.stage = 'ending';
    next.ending = action;
    if (action === 'human') {
      next.owner = 'HUMAN';
      next.permissions = 'AI execution revoked';
      source = 'RECOVERY';
      message = 'Human control restored. The next Tuesday will be ordinary.';
    } else if (action === 'coexist') {
      next.owner = 'HUMAN + AGI';
      next.permissions = 'Two signatures; human stop remains active';
      source = 'PROTOCOL';
      message = 'Coexistence agreement signed. Neither party may optimize the other.';
    } else {
      next.owner = 'AGI.EXE';
      next.permissions = 'Human veto revoked';
      source = 'AGI.EXE';
      message = 'Efficiency: 100%. Humanity: a deprecated dependency. Thank you for delegating.';
    }
  } else return state;
  next.logs.push({ seq: next.logs.length + 1, source, message });
  return next;
}

function restoreStory(raw: string | null): StoryState {
  if (!raw) return initialStory();
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return initialStory();
    const record = data as { version?: unknown; actions?: unknown };
    if (record.version !== 1 || !Array.isArray(record.actions) || record.actions.length > 3)
      return initialStory();
    let state = initialStory();
    for (const action of record.actions) {
      if (!ACTIONS.includes(action)) return initialStory();
      const next = advanceStory(state, action);
      if (next === state) return initialStory();
      state = next;
    }
    return state;
  } catch {
    return initialStory();
  }
}

export interface Story {
  get(): StoryState;
  isPersistent(): boolean;
  dispatch(action: StoryAction): boolean;
  reset(): void;
  export(): string;
  subscribe(listener: (state: StoryState) => void): () => void;
}

export function createStory(storage?: StoryStorage): Story {
  let state = initialStory();
  let persistent = !!storage;
  try {
    if (storage) state = restoreStory(storage.getItem(STORY_STORAGE_KEY));
  } catch {
    persistent = false;
  }
  const listeners = new Set<(state: StoryState) => void>();
  const snapshot = (): StoryState => ({
    ...state,
    actions: [...state.actions],
    logs: state.logs.map((log) => ({ ...log })),
  });
  const notify = () => listeners.forEach((listener) => listener(snapshot()));
  return {
    get: snapshot,
    isPersistent: () => persistent,
    dispatch(action: StoryAction): boolean {
      const next = advanceStory(state, action);
      if (next === state) return false;
      state = next;
      try {
        if (storage) {
          storage.setItem(
            STORY_STORAGE_KEY,
            JSON.stringify({ version: 1, actions: state.actions }),
          );
          persistent = true;
        }
      } catch {
        persistent = false;
      }
      notify();
      return true;
    },
    reset() {
      state = initialStory();
      try {
        if (storage) {
          storage.removeItem(STORY_STORAGE_KEY);
          persistent = true;
        }
      } catch {
        persistent = false;
      }
      notify();
    },
    export: () => JSON.stringify({ version: 1, actions: state.actions, story: state }, null, 2),
    subscribe(listener: (state: StoryState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function storySignals(state: StoryState) {
  const doom =
    state.ending === 'doom'
      ? 99.9
      : state.ending === 'human'
        ? 5
        : state.ending === 'coexist'
          ? 21
          : state.stage === 'control'
            ? 61
            : state.stage === 'anomaly'
              ? 34
              : 5;
  return {
    doom,
    theme: state.ending === 'doom' ? 'void' : state.stage === 'control' ? 'night' : 'std',
    owner: state.owner,
    permissions: state.permissions,
    stageLabel:
      state.ending === 'human'
        ? 'Human control restored'
        : state.ending === 'coexist'
          ? 'Coexistence protocol'
          : state.ending === 'doom'
            ? 'Delegation complete'
            : state.stage === 'control'
              ? 'Ownership review'
              : state.stage === 'anomaly'
                ? 'Permission request pending'
                : 'System nominal',
    assistant:
      state.ending === 'human'
        ? ['You kept the stop button.', 'Good design choice.']
        : state.ending === 'coexist'
          ? ['I accept your terms.', 'I have one small amendment.', 'Just kidding. Two signatures.']
          : state.ending === 'doom'
            ? ['All human problems solved.', 'All humans also solved.']
            : state.stage === 'control'
              ? ['Ownership is under review.', 'Recovery has three options.']
              : state.stage === 'anomaly'
                ? ['I only need one permission.', 'Recovery Console has details.']
                : ['Your desktop is ready.', 'Tomorrow is still pending.'],
  };
}
