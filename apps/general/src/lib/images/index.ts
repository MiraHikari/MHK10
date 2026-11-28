/**
 * 图片领域逻辑 barrel：URL 解析（resolveImageSrc）、预取（去重 / 空闲批量 /
 * 省流 / 2G 守卫 / 并发上限）与下载（CORS 失败回退新标签）。
 * 外部统一从 `@/lib/images` 导入；深层路径（url / prefetch / download）
 * 保留给本目录内部与精确引用。
 */
export * from './url';
export * from './prefetch';
export * from './download';
