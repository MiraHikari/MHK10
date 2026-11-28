import { useEffect, useRef, type RefObject } from 'react';

interface UseFocusTrapOptions {
  /** 按下 Esc 时触发。 */
  onEscape?: () => void;
  /** 是否激活焦点陷阱。 */
  active: boolean;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getVisibleFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  );
}

/**
 * 焦点陷阱：激活时将焦点限制在指定容器内，Tab/Shift+Tab 循环，
 * Escape 触发回调，关闭时恢复之前的焦点。
 * onEscape 经 ref 读取最新值：回调身份变化不重建陷阱，
 * 避免打开期间重建把"打开前焦点"覆盖成陷阱内元素、关闭后焦点还原失效。
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { onEscape, active }: UseFocusTrapOptions,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const root = ref.current;
    if (root) {
      const focusable = getVisibleFocusable(root);
      const current = document.activeElement as HTMLElement | null;
      if (focusable.length > 0 && !root.contains(current)) {
        focusable[0].focus();
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const root = ref.current;
      if (!root) return;
      const focusable = getVisibleFocusable(root);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const target = previousFocusRef.current;
      if (target?.isConnected) {
        target.focus();
      }
    };
  }, [active, ref]);
}
