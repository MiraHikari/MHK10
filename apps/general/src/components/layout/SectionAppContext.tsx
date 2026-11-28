import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Project } from '@/lib/projects/types';
import type { CommandTarget } from '@/hooks/useCommandTargetHighlight';

/**
 * App-level dependencies shared by section components. Independent contexts
 * keep navigation, project data, and command targeting from invalidating one
 * another's consumers.
 */
interface SectionNavigationContextValue {
  readonly bgmPlaying: boolean;
  readonly onNavigate: (sectionId: string) => void;
}

const SectionNavigationContext = createContext<SectionNavigationContextValue | null>(null);
const SectionProjectsContext = createContext<readonly Project[] | null>(null);
const SectionCommandTargetContext = createContext<CommandTarget | null | undefined>(undefined);

export function SectionAppProvider({
  projects,
  bgmPlaying,
  onNavigate,
  commandTarget,
  children,
}: {
  readonly projects: readonly Project[];
  readonly bgmPlaying: boolean;
  readonly onNavigate: (sectionId: string) => void;
  readonly commandTarget: CommandTarget | null;
  readonly children: ReactNode;
}) {
  const navigationValue = useMemo(() => ({ bgmPlaying, onNavigate }), [bgmPlaying, onNavigate]);

  return (
    <SectionNavigationContext.Provider value={navigationValue}>
      <SectionProjectsContext.Provider value={projects}>
        <SectionCommandTargetContext.Provider value={commandTarget}>
          {children}
        </SectionCommandTargetContext.Provider>
      </SectionProjectsContext.Provider>
    </SectionNavigationContext.Provider>
  );
}

export function useSectionNavigation(): SectionNavigationContextValue {
  const value = useContext(SectionNavigationContext);
  if (!value) {
    throw new Error('useSectionNavigation() used outside a SectionAppProvider');
  }
  return value;
}

export function useSectionProjects(): readonly Project[] {
  const value = useContext(SectionProjectsContext);
  if (!value) {
    throw new Error('useSectionProjects() used outside a SectionAppProvider');
  }
  return value;
}

export function useSectionCommandTarget(): CommandTarget | null {
  const value = useContext(SectionCommandTargetContext);
  if (value === undefined) {
    throw new Error('useSectionCommandTarget() used outside a SectionAppProvider');
  }
  return value;
}
