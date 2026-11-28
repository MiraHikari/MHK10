/** 后台布局原语：卡片与表单字段行。 */

import type { ReactNode } from 'react';

// ------------------------------------------------------------------
// Card
// ------------------------------------------------------------------
export interface CardProps {
  children?: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-lg border border-white/10 bg-zinc-900/50 p-4 ${className}`}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------
// FieldRow
// ------------------------------------------------------------------
export interface FieldRowProps {
  label: string;
  /** 关联控件的 id（label htmlFor）。 */
  htmlFor?: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}

export function FieldRow({ label, htmlFor, help, required, children }: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-200">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
      {help && <p className="text-xs text-zinc-500">{help}</p>}
    </div>
  );
}
