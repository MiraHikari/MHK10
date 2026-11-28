import { createContext, useContext, type ReactNode } from 'react';

/**
 * Per-section "content ready" flag — `isActive && navigation.contentReady`.
 *
 * Previously threaded through ~15 files as a prop (registry → section →
 * shell/masthead → split heading / skill rows / honor cards / stat counters).
 * Provided inside each section scroll host by `SectionViewport`; leaves read it
 * via `useSectionReady()`.
 *
 * Default `false` matches the SSR state: at build time every section renders
 * with `contentReady = false`, so server HTML and first client render agree.
 */
const SectionReadyContext = createContext(false);

export function SectionReadyProvider({
  isReady,
  children,
}: {
  readonly isReady: boolean;
  readonly children: ReactNode;
}) {
  return <SectionReadyContext.Provider value={isReady}>{children}</SectionReadyContext.Provider>;
}

/** Whether the enclosing section has completed its entrance transition. */
export function useSectionReady(): boolean {
  return useContext(SectionReadyContext);
}
