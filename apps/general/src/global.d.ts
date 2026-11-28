declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.png?url' {
  const src: string;
  export default src;
}

declare module '~icons/*' {
  import type { ForwardRefExoticComponent, SVGProps } from 'react';
  const component: ForwardRefExoticComponent<SVGProps<SVGSVGElement> & { title?: string }>;
  export default component;
}
