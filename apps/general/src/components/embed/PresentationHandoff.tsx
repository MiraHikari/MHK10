import { useEffect, useRef, useState } from 'react';
import { getDesktopEntry } from '@/hooks/presentation-controller';
import type { DisplayMode } from '@/hooks/useDisplayMode';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { shouldConserveData } from '@/lib/images/prefetch';
import { motionDuration } from '@/lib/motion';

export const HANDOFF_FAILURE = '本次切换未完成，已返回通用版。';

interface PresentationHandoffProps {
  readonly mode: DisplayMode;
  readonly pending: boolean;
  readonly attempt: number;
  readonly coldEntry: boolean;
  readonly failed: boolean;
  readonly onCancel: () => void;
}

export default function PresentationHandoff({
  mode,
  pending,
  attempt,
  coldEntry,
  failed,
  onCancel,
}: PresentationHandoffProps) {
  const { motionLevel, perfTier, finePointer, isDesktop } = useMediaCapabilities();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const token = pending ? `${mode}:${attempt}` : null;
  const open = token !== null && revealed === token;
  const message = mode === 'win95' ? '正在连接 MHK10' : '正在返回通用版';
  const entry = pending && mode === 'win95' ? getDesktopEntry() : null;
  const edge = entry?.trigger.isConnected ? entry.edge : undefined;
  const dock = isDesktop && entry?.docked && edge && edge.left >= 300 ? edge : null;
  const prism =
    pending &&
    coldEntry &&
    motionLevel === 'full' &&
    perfTier !== 'low' &&
    finePointer &&
    isDesktop &&
    !shouldConserveData();

  useEffect(() => {
    if (token === null) return;
    const timer = window.setTimeout(
      () => setRevealed(token),
      motionDuration.presentationHandoff * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    if (!open) return;
    if (
      document.activeElement === document.body ||
      document.activeElement === getDesktopEntry()?.trigger
    ) {
      cancelRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, onCancel]);

  return (
    <>
      {prism ? (
        <span
          className="presentation-prism"
          data-entry-prism
          data-docked={dock !== null}
          aria-hidden="true"
          style={
            edge?.width ? { left: edge.left, top: edge.top, inlineSize: edge.width } : undefined
          }
        >
          <i className="presentation-prism__light" />
          <i className="presentation-prism__pixels" />
        </span>
      ) : null}
      <div
        className="presentation-handoff"
        data-open={open}
        data-mode={mode}
        data-docked={dock !== null}
        style={
          dock
            ? { left: dock.left, top: `clamp(0.875rem, ${dock.top}px, 100dvh - 6rem)` }
            : undefined
        }
        hidden={!open}
      >
        <div className="presentation-handoff__copy">
          <p className="presentation-handoff__label" lang="en">
            {mode === 'win95' ? 'MHK10 / DISPLAY BRIDGE' : 'MIRAHIKARI / CLASSIC'}
          </p>
          <p aria-hidden="true">{message}</p>
        </div>
        <button
          ref={cancelRef}
          type="button"
          className="presentation-handoff__cancel"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
      <p className="sr-only" role="status">
        {failed ? HANDOFF_FAILURE : open ? message : ''}
      </p>
    </>
  );
}
