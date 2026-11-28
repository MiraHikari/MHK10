import { describe, expect, it } from 'vite-plus/test';
import {
  advanceStory,
  createStory,
  initialStory,
  storySignals,
  STORY_STORAGE_KEY,
  type StoryStorage,
  type StoryEnding,
} from './story';

function memoryStorage(seed?: string) {
  const values = new Map<string, string>(seed ? [[STORY_STORAGE_KEY, seed]] : []);
  const storage: StoryStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
  return { values, storage };
}

describe('local story choices', () => {
  it('stays quiet on reads and rejects skipping authorization', () => {
    const service = createStory();
    for (let i = 0; i < 200; i++) service.get();
    for (const action of ['audit', 'install', 'human', 'coexist', 'doom'] as const)
      expect(service.dispatch(action)).toBe(false);
    expect(service.get()).toEqual(initialStory());
    expect(storySignals(service.get()).doom).toBe(5);
  });

  it.each(['train', 'investigate', 'optimize'] as const)(
    'starts only after explicit %s, retaining human approval',
    (action) => {
      const first = advanceStory(initialStory(), action);
      expect(first.stage).toBe('anomaly');
      expect(first.owner).toBe('HUMAN');
      expect(advanceStory(first, action)).toBe(first);
      expect(advanceStory(first, 'doom')).toBe(first);
    },
  );

  it('distinguishes permission delegation from a read-only audit', () => {
    const anomaly = advanceStory(initialStory(), 'train');
    expect(advanceStory(anomaly, 'audit').owner).toBe('HUMAN');
    expect(advanceStory(anomaly, 'install').owner).toBe('AGI.EXE');
  });

  it.each<StoryEnding>(['human', 'coexist', 'doom'])(
    'completes and restores the %s ending without further escalation',
    (ending) => {
      const { storage } = memoryStorage();
      const service = createStory(storage);
      service.dispatch('train');
      service.dispatch('install');
      expect(service.dispatch(ending)).toBe(true);
      const final = service.get();
      expect(final.stage).toBe('ending');
      expect(final.ending).toBe(ending);
      expect(final.logs).toHaveLength(5);
      expect(service.dispatch('doom')).toBe(false);
      expect(createStory(storage).get()).toEqual(final);
      expect(storySignals(final).doom).toBe(
        ending === 'human' ? 5 : ending === 'coexist' ? 21 : 99.9,
      );
      expect(final.owner).toBe(
        ending === 'human' ? 'HUMAN' : ending === 'coexist' ? 'HUMAN + AGI' : 'AGI.EXE',
      );
    },
  );

  it('replays a fresh branch after reset without touching unrelated local files', () => {
    const { storage, values } = memoryStorage();
    values.set('notepad.diary', 'Keep my Tuesday.');
    const service = createStory(storage);
    service.dispatch('optimize');
    service.dispatch('install');
    service.dispatch('doom');
    const exported = JSON.parse(service.export());
    expect(exported.actions).toEqual(['optimize', 'install', 'doom']);
    service.reset();
    expect(service.get()).toEqual(initialStory());
    expect(values.get('notepad.diary')).toBe('Keep my Tuesday.');
    expect(values.has(STORY_STORAGE_KEY)).toBe(false);
    service.dispatch('investigate');
    service.dispatch('audit');
    service.dispatch('human');
    expect(service.get().ending).toBe('human');
  });

  it.each([
    'not json',
    '{"version":2,"actions":[]}',
    '{"version":1,"actions":["doom"]}',
    '{"version":1,"actions":["train","train"]}',
    '{"version":1,"actions":["train","install","doom","human"]}',
  ])('recovers malformed or impossible stored history: %s', (seed) => {
    expect(createStory(memoryStorage(seed).storage).get()).toEqual(initialStory());
  });

  it('continues in memory when browser storage is unavailable', () => {
    const fail = () => {
      throw new Error('storage denied');
    };
    const service = createStory({ getItem: fail, setItem: fail, removeItem: fail });
    expect(service.dispatch('train')).toBe(true);
    expect(service.isPersistent()).toBe(false);
    expect(JSON.parse(service.export()).actions).toEqual(['train']);
    expect(() => service.reset()).not.toThrow();
    expect(service.get().stage).toBe('quiet');
  });

  it('isolates snapshots and sends changes to subscribers once', () => {
    const service = createStory();
    const stages: string[] = [];
    const unsubscribe = service.subscribe((state) => {
      stages.push(state.stage);
      state.logs[0].message = 'tampered';
    });
    const snapshot = service.get();
    snapshot.actions.push('doom');
    snapshot.logs[0].message = 'tampered';
    expect(service.get()).toEqual(initialStory());
    service.dispatch('train');
    service.dispatch('train');
    unsubscribe();
    service.dispatch('audit');
    expect(stages).toEqual(['anomaly']);
    expect(service.get().logs[0].message).toBe(initialStory().logs[0].message);
  });
});
