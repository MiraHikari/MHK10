// 定制品牌符号，iconify 无等价物，保留本地。
interface IconProps {
  className?: string;
  size?: number;
}

export function ApeironIcon({ className }: Pick<IconProps, 'className'>) {
  return (
    <svg
      width="28"
      height="16"
      viewBox="0 0 28 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <circle cx="8" cy="8" r="6" />
      <circle cx="20" cy="8" r="6" />
    </svg>
  );
}

export function KairosIcon({ className }: Pick<IconProps, 'className'>) {
  return (
    <svg
      width="20"
      height="24"
      viewBox="0 0 20 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M2 2 L18 2 L10 12 Z" />
      <path d="M2 22 L18 22 L10 12 Z" />
      <line x1="2" y1="2" x2="18" y2="2" />
      <line x1="2" y1="22" x2="18" y2="22" />
    </svg>
  );
}

export function EcstasisIcon({ className }: Pick<IconProps, 'className'>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" opacity="0.6" />
      <circle cx="12" cy="12" r="11" opacity="0.3" />
    </svg>
  );
}
