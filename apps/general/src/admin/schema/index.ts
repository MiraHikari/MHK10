/**
 * 后台表单 schema barrel：类型、校验与各内容类型的字段定义。
 * 外部统一从 `@/admin/schema` 导入；按领域拆分见同目录子模块
 * （types / validation / blog / projects / profile）。
 */
export * from './types';
export * from './validation';
export * from './blog';
export * from './projects';
export * from './profile';
