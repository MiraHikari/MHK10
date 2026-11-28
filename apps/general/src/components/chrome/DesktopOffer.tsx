import { AnimatePresence, motion } from 'motion/react';
import MonitorIcon from '~icons/lucide/monitor';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import {
  acceptDesktopOffer,
  dismissDesktopHint,
  dismissDesktopOffer,
  useDesktopOffer,
} from '@/hooks/useDesktopOffer';
import { motionDuration, motionEase } from '@/lib/motion';
import DesktopOfferPreview from './DesktopOfferPreview';

/**
 * The desktop is offered, never entered silently.
 *
 * Every desktop-class viewport gets the real recommendation beside the hero
 * copy — touch screens included; the phone entry check still runs on accept,
 * so the card never bypasses the pointer-first warning. Narrow windows and
 * metered visits get a one-line pointer to the screen-edge switch instead.
 * Both surfaces are dismissible and remember the answer for the session;
 * accepting the offer also persists the presentation choice.
 *
 * The card argues with a live miniature rather than a paragraph: the visitor
 * can drag the window and open Start before deciding.
 */
export default function DesktopOffer() {
  const { state } = useDesktopOffer();
  const { reducedMotion } = useMediaCapabilities();

  return (
    <AnimatePresence initial={false}>
      {state === 'offer' ? (
        <motion.aside
          key="desktop-offer"
          className="about-entry__offer"
          data-desktop-entry-anchor
          aria-label="MHK10 桌面推荐"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={
            reducedMotion
              ? { duration: motionDuration.instant }
              : { duration: motionDuration.control, ease: motionEase }
          }
        >
          <p className="about-entry__offer-eyebrow">
            <span className="about-entry__offer-label">
              <MonitorIcon aria-hidden="true" className="h-4 w-4" />
              MHK10 · DESKTOP
            </span>
            <span className="about-entry__offer-note">640×360 · 16 色</span>
          </p>
          <DesktopOfferPreview />
          <div className="about-entry__offer-actions">
            <button
              type="button"
              onClick={(event) => acceptDesktopOffer(event.currentTarget)}
              className="about-entry__offer-cta about-entry__offer-cta--primary"
            >
              进入桌面 <ArrowUpRightIcon aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={dismissDesktopOffer}
              className="about-entry__offer-cta about-entry__offer-cta--secondary"
            >
              留在通用版
            </button>
          </div>
        </motion.aside>
      ) : null}

      {state === 'hint' ? (
        <motion.p
          key="desktop-hint"
          className="about-entry__hint"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            reducedMotion
              ? { duration: motionDuration.instant }
              : { duration: motionDuration.control, ease: motionEase }
          }
        >
          <span className="about-entry__hint-copy">
            <MonitorIcon aria-hidden="true" className="about-entry__hint-icon" />
            <span>MHK10 像素桌面，在屏幕边缘。</span>
          </span>
          <button type="button" onClick={dismissDesktopHint}>
            知道了
          </button>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
