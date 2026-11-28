import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

const SectionScrollContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function SectionScrollProvider({
  scrollRef,
  children,
}: {
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}) {
  return (
    <SectionScrollContext.Provider value={scrollRef}>{children}</SectionScrollContext.Provider>
  );
}

/** Scroll root for `whileInView` — section overflow container, not the window. */
export function useSectionScrollRoot(): RefObject<HTMLElement | null> | null {
  return useContext(SectionScrollContext);
}

type SectionScrollHostProps = Omit<HTMLMotionProps<'div'>, 'ref'> & {
  readonly assignRef: (element: HTMLDivElement | null) => void;
  readonly children: ReactNode;
};

/**
 * Section overflow scroller that merges navigation's section ref with a stable
 * RefObject exposed via context for Swap / whileInView.
 */
export function SectionScrollHost({ assignRef, children, ...motionProps }: SectionScrollHostProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      assignRef(element);
    },
    [assignRef],
  );

  return (
    <motion.div ref={setRef} {...motionProps}>
      <SectionScrollProvider scrollRef={scrollRef}>{children}</SectionScrollProvider>
    </motion.div>
  );
}
