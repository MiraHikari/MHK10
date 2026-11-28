/** 后台对话框原语：模态覆盖层与确认弹窗。 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './form';

// ------------------------------------------------------------------
// ModalDialog
// ------------------------------------------------------------------
export interface ModalDialogProps {
  open: boolean;
  /** 对话框标题（可访问名称 + 视觉 h3）。 */
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * 原生 `<dialog>` + `showModal()`：焦点陷阱、背景 inert、Escape（`cancel`
 * 事件）与 `::backdrop` 都由浏览器提供，close 后焦点自动还给触发元素。
 * 点击遮罩关闭用 dialog 自身的命中检测（`closedby="any"` 尚未跨浏览器）。
 */
export function ModalDialog({ open, title, onClose, className = '', children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      // 面板样式放在 dialog 本身（它会居中并脱离文档流）；遮罩走 ::backdrop。
      className={`m-auto w-full max-w-sm rounded-lg border border-white/10 bg-zinc-900 p-5 shadow-xl backdrop:bg-black/60 ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // 点击 dialog 自身而不是内容 = 点到遮罩。
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
      {children}
    </dialog>
  );
}

// ------------------------------------------------------------------
// ConfirmDialog
// ------------------------------------------------------------------
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalDialog open={open} title={title} onClose={onCancel}>
      {description && <p className="mt-2 text-sm text-zinc-400">{description}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </ModalDialog>
  );
}
