/**
 * 灯箱内部实现 barrel：按需加载入口 `@/components/effects/Lightbox` 之外的
 * YARL 装配与自绘控件。壳组件通过 `import('./lightbox')` 懒加载本模块。
 */
export { LightboxYarlRoot } from './root';
export type { LightboxYarlRootProps } from './root';
