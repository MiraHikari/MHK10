import { createContext, useContext, type ReactNode } from 'react';

/**
 * Section-level light/dark — independent of `html.dark` (always on for UI chrome).
 * Provided by `SectionCanvas`; consumers must not use Tailwind `dark:`.
 */
const SectionThemeContext = createContext<boolean | null>(null);

export function SectionThemeProvider({
  isDark,
  children,
}: {
  readonly isDark: boolean;
  readonly children: ReactNode;
}) {
  return <SectionThemeContext.Provider value={isDark}>{children}</SectionThemeContext.Provider>;
}

/** Section `isDark` from nearest `SectionCanvas`, or `null` outside a canvas. */
export function useSectionIsDark(): boolean | null {
  return useContext(SectionThemeContext);
}

/** Resolve explicit prop, then context, then `false` (light). */
export function useResolvedSectionIsDark(isDarkProp?: boolean): boolean {
  const fromContext = useSectionIsDark();
  if (isDarkProp !== undefined) return isDarkProp;
  return fromContext ?? false;
}
