/**
 * Markdown 正文编辑字段。
 * 等宽字体、大编辑区、实时字数统计。
 */

import { TextArea } from '@/admin/ui/primitives';

export interface MarkdownFieldProps {
  label?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function MarkdownField({
  label = '正文',
  value,
  placeholder,
  disabled,
  onChange,
}: MarkdownFieldProps) {
  const charCount = value.length;
  const wordCount = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;

  return (
    <div className="space-y-2 markdown-field">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-200">{label}</label>
        <span className="text-xs text-zinc-500">
          {charCount} 字符 · {wordCount} 词
        </span>
      </div>
      <TextArea
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={16}
        onChange={onChange}
      />
      <style>{`
        .markdown-field textarea {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace, var(--font-cjk-fallback, system-ui, sans-serif);
          min-height: 50vh;
        }
      `}</style>
    </div>
  );
}
