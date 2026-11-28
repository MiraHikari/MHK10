/** Hidden poses — used by scroll-triggered `Swap` (blur-reveal「思绪浮现」). */
export const hide = { opacity: 0, filter: 'blur(8px)' } as const;
export const shown = { opacity: 1, filter: 'blur(0px)' } as const;
