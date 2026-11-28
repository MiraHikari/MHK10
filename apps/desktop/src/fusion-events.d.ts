import { FUSION_EVENTS } from '@mhk/site-core/fusion/protocol-model';

declare global {
  interface WindowEventMap {
    [FUSION_EVENTS.flushReading]: Event;
  }
}

export {};
