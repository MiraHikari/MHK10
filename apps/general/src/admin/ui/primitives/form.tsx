/**
 * 后台深色主题表单原语：Button 与各输入控件。
 * 仅使用 Tailwind 4 工具类，无外部依赖。
 */

import type { ReactNode } from 'react';
import { useState } from 'react';

// ------------------------------------------------------------------
// Button
// ------------------------------------------------------------------
export interface ButtonProps {
  children?: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  onClick,
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/50 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-sky-500 hover:bg-sky-400 text-white shadow-sm shadow-sky-900/20',
    ghost: 'bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10',
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------
// TextInput
// ------------------------------------------------------------------
export interface TextInputProps {
  id?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'password' | 'url' | 'email';
  /** 透传给 input：凭据类字段避免密码管理器/拼写检查干扰。 */
  autoComplete?: string;
  spellCheck?: boolean;
  onChange: (value: string) => void;
}

export function TextInput({
  id,
  value,
  placeholder,
  disabled,
  type = 'text',
  autoComplete,
  spellCheck,
  onChange,
}: TextInputProps) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-11 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/50"
    />
  );
}

// ------------------------------------------------------------------
// TextArea
// ------------------------------------------------------------------
export interface TextAreaProps {
  id?: string;
  value: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function TextArea({ id, value, placeholder, rows = 4, disabled, onChange }: TextAreaProps) {
  return (
    <textarea
      id={id}
      value={value}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-[88px] px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/50 resize-y"
    />
  );
}

// ------------------------------------------------------------------
// NumberInput
// ------------------------------------------------------------------
export interface NumberInputProps {
  id?: string;
  value: number | undefined;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}

export function NumberInput({ id, value, placeholder, disabled, onChange }: NumberInputProps) {
  return (
    <input
      id={id}
      type="number"
      value={value === undefined ? '' : value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          onChange(undefined);
          return;
        }
        const parsed = Number(raw);
        onChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
      className="w-full min-h-11 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/50"
    />
  );
}

// ------------------------------------------------------------------
// DateInput
// ------------------------------------------------------------------
export interface DateInputProps {
  id?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function DateInput({ id, value, disabled, onChange }: DateInputProps) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-11 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/50 [color-scheme:dark]"
    />
  );
}

// ------------------------------------------------------------------
// Select
// ------------------------------------------------------------------
export interface SelectProps {
  id?: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function Select({ id, value, options, placeholder, disabled, onChange }: SelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-11 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/50"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------
// Toggle
// ------------------------------------------------------------------
export interface ToggleProps {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ id, checked, disabled, onChange }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/50 ${
        checked ? 'bg-sky-500' : 'bg-zinc-700'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ------------------------------------------------------------------
// TagInput
// ------------------------------------------------------------------
export interface TagInputProps {
  id?: string;
  tags: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (tags: readonly string[]) => void;
}

export function TagInput({ id, tags, placeholder, disabled, onChange }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const next = raw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const merged = [...tags, ...next];
    onChange(merged);
  };

  const removeTag = (index: number) => {
    const next = tags.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div
      id={id}
      className="w-full min-h-11 px-2 py-1.5 rounded-lg bg-zinc-900 border border-white/10 focus-within:ring-2 focus-within:ring-sky-400/50 focus-within:border-sky-400/50"
    >
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 text-sky-200 text-sm"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeTag(index)}
              className="ml-1 leading-none text-sky-300 hover:text-white disabled:opacity-50"
              aria-label={`删除 ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          aria-label={placeholder ?? '标签输入'}
          placeholder={tags.length === 0 ? placeholder : undefined}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // IME 组合中的 Enter 用于拼音/候选上屏，不应把半截输入切成
              // 标签。先阻止默认的隐式表单提交，再按组合状态提前返回；
              // Safari 的 compositionend 可能先于 keydown 派发，故兼看 229。
              e.preventDefault();
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (input.trim()) {
                addTag(input);
                setInput('');
              }
            } else if (e.nativeEvent.isComposing) {
              return;
            } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
              removeTag(tags.length - 1);
            } else if (e.key === ',' || e.key === '，') {
              e.preventDefault();
              if (input.trim()) {
                addTag(input);
                setInput('');
              }
            }
          }}
          onBlur={() => {
            if (input.trim()) {
              addTag(input);
              setInput('');
            }
          }}
          className="flex-1 min-w-[80px] min-h-8 px-1 bg-transparent text-zinc-100 text-sm placeholder:text-zinc-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
