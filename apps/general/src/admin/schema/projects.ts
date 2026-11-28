import type { FieldSchema } from './types';

/** 项目 frontmatter 的字段定义。 */
export const PROJECT_FRONTMATTER_SCHEMA: readonly FieldSchema[] = [
  { key: 'title', label: '标题', type: 'string', required: true },
  { key: 'description', label: '描述', type: 'text', required: true },
  { key: 'image', label: '封面图', type: 'string' },
  { key: 'tags', label: '标签', type: 'tags', required: true },
  { key: 'link', label: '项目链接', type: 'string' },
  { key: 'github', label: 'GitHub', type: 'string' },
  {
    key: 'date',
    label: '日期',
    type: 'string',
    required: true,
    help: 'YYYY 或 YYYY-MM-DD',
  },
  { key: 'featured', label: '精选', type: 'boolean' },
  { key: 'active', label: '进行中', type: 'boolean' },
  { key: 'order', label: '排序', type: 'number' },
] as const;
