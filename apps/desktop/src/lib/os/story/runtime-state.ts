import { createDoom, doomDown, doomUp } from './doom';
import { storySignals, type createStory, type StoryState } from './story';

export interface RuntimeSnapshot {
  story: StoryState;
  meter: number;
  baselineRisk: number;
}

/** Story transitions reset the meter; between transitions its controls retain their rules. */
export function createRuntimeState(
  story: ReturnType<typeof createStory>,
  mode: 'story' | 'legacy' = 'story',
  initialMeter = 5,
) {
  const doom = createDoom();
  const restore = (value: number) => {
    if (Number.isFinite(value)) doom.v = Math.max(5, Math.min(99.9, value));
  };
  restore(mode === 'story' ? storySignals(story.get()).doom : initialMeter);
  const unsubscribe = story.subscribe((state) => {
    doom.v = storySignals(state).doom;
    doom.fired.clear();
  });
  return {
    doom,
    snapshot(): RuntimeSnapshot {
      const state = story.get();
      return { story: state, meter: doom.v, baselineRisk: storySignals(state).doom };
    },
    up(): { recovery: boolean } {
      if (mode === 'legacy') {
        doomUp(doom);
        return { recovery: false };
      }
      const state = story.get();
      if (state.ending) return { recovery: true };
      if (state.stage === 'quiet') story.dispatch('investigate');
      else {
        doomUp(doom);
        doom.v = Math.min(doom.v, state.stage === 'anomaly' ? 60 : 99);
      }
      return { recovery: doom.v === 60 || doom.v === 99 };
    },
    down: () => doomDown(doom),
    restore,
    dispose: unsubscribe,
  };
}
