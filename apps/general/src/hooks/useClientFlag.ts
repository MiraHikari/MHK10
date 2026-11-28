import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const server = () => false;

/** Browser capability flags use the same false snapshot for SSR and hydration. */
export function useClientFlag(read: () => boolean): boolean {
  return useSyncExternalStore(subscribe, read, server);
}
