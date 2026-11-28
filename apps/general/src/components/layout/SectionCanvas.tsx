import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  SectionScrollProvider,
  useSectionScrollRoot,
} from '@/components/motion/SectionScrollContext';
import { SectionThemeProvider } from '@/components/layout/SectionThemeContext';

interface SectionCanvasProps {
  readonly sectionId?: string;
  readonly isDark?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Section frame: min-h-dvh, rail inset, content rhythm.
 * Reuses Task 4.2 `SectionScrollContext` — forwards the App scroll host when
 * present, otherwise provides a local root for standalone usage.
 * Provides section `isDark` via `SectionThemeProvider` (not `html.dark`).
 */
export default function SectionCanvas({
  sectionId,
  isDark = false,
  children,
  className,
}: SectionCanvasProps) {
  const parentScrollRoot = useSectionScrollRoot();
  const localRef = useRef<HTMLElement | null>(null);
  const scrollRef = parentScrollRoot ?? localRef;

  return (
    <section
      id={sectionId}
      data-section={sectionId}
      ref={
        parentScrollRoot
          ? undefined
          : (element) => {
              localRef.current = element;
            }
      }
      className={cn(
        'relative min-h-screen min-h-dvh flex flex-col overflow-x-clip md:pl-20 lg:pl-24',
        className,
      )}
    >
      <SectionThemeProvider isDark={isDark}>
        <SectionScrollProvider scrollRef={scrollRef}>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0 px-6 md:px-10 lg:px-16 pt-20 pb-16 md:py-20 flex flex-col">
              {children}
            </div>
          </div>
        </SectionScrollProvider>
      </SectionThemeProvider>
    </section>
  );
}
