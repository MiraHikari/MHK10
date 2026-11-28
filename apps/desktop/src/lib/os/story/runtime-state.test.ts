import { describe, expect, it } from 'vite-plus/test';
import { createStory } from './story';
import { createRuntimeState } from './runtime-state';

describe('runtime risk snapshot', () => {
  it('keeps the current meter distinct from the narrative baseline', () => {
    const story = createStory();
    const runtime = createRuntimeState(story);
    runtime.up();
    runtime.up();
    expect(runtime.snapshot()).toMatchObject({ meter: 39.5, baselineRisk: 34 });
    story.dispatch('audit');
    expect(runtime.snapshot().meter).toBe(61);
    story.dispatch('coexist');
    runtime.down();
    expect(runtime.snapshot()).toMatchObject({ meter: 15.5, baselineRisk: 21 });
    expect(runtime.up().recovery).toBe(true);
  });
  it('restores the narrative on startup and retains the legacy standalone meter', () => {
    const story = createStory();
    story.dispatch('investigate');
    expect(createRuntimeState(story).snapshot().meter).toBe(34);
    expect(createRuntimeState(story, 'legacy', 72).snapshot().meter).toBe(72);
  });
  it('stops reacting to the story after disposal', () => {
    const story = createStory();
    const runtime = createRuntimeState(story);
    runtime.dispose();
    story.dispatch('investigate');
    expect(runtime.snapshot().meter).toBe(5);
  });
});
