export const GITHUB_OWNER = 'MiraHikari';
export const GITHUB_REPO = 'example-owner/example-content-repo';
export const GITHUB_BRANCH = 'main';

export const BLOG_CONTENT_DIR = 'packages/site-core/content/blog';
export const PROJECTS_CONTENT_DIR = 'packages/site-core/content/projects';
export const PROFILE_JSON_PATH = 'packages/site-core/content/profile.json';
export const GENERAL_PUBLIC_IMAGE_DIR = 'apps/general/public/images';

/**
 * 图片目录映射。
 * 迁移到 R2 后，这些路径同时用于：
 * 1. 推导 R2 object key 前缀（去掉 public/，得到 images/<folder>）。
 * 2. 生成站内图片路径 /images/<folder>/...（保留在 profile.json / content frontmatter 中）。
 */
export const IMAGE_DIRS = {
  gallery: 'public/images/gallery',
  honors: 'public/images/honors',
  projects: 'public/images/projects',
} as const;

export type ImageFolder = keyof typeof IMAGE_DIRS;

/**
 * 从 IMAGE_DIRS 推导出 R2 object key 前缀。
 * 例如 public/images/gallery -> images/gallery。
 */
export function r2KeyPrefix(folder: ImageFolder): string {
  return IMAGE_DIRS[folder].replace(/^public\//, '');
}
