import { useEffect, useEffectEvent, type RefObject } from 'react';

/**
 * 轻量浮层（菜单 / 下拉）的“点击外部或 Escape 关闭”。
 *
 * 分享菜单与行宽菜单此前各写了一份相同的 pointerdown + keydown 监听；
 * 集中到这里后，未来迁移到原生 `popover` 只需替换调用点。原生 `<dialog>`
 * 模态仍应使用浏览器自带的 Escape 与焦点管理，不要叠加本 hook。
 *
 * `onDismiss` 经 Effect Event 读取：调用点通常传入内联箭头函数，若放进
 * 依赖数组，每次父组件重渲染都会重新挂载文档级监听。
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  const dismiss = useEffectEvent(() => onDismiss());

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open]);
}
