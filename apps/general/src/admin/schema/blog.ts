import type { FieldSchema } from './types';

/** 博客文章 frontmatter 的字段定义。 */
export const BLOG_FRONTMATTER_SCHEMA: readonly FieldSchema[] = [
  { key: 'title', label: '标题', type: 'string', required: true },
  { key: 'description', label: '摘要', type: 'text', required: true },
  { key: 'publishDate', label: '发布日期', type: 'date', required: true },
  { key: 'updatedDate', label: '更新日期', type: 'date' },
  { key: 'tags', label: '标签', type: 'tags' },
  { key: 'category', label: '分类', type: 'string' },
  {
    key: 'heroImage',
    label: '封面图',
    type: 'string',
    help: '图片路径，如 /images/blog/hero.webp',
  },
  { key: 'heroAlt', label: '封面图说明', type: 'string' },
  { key: 'draft', label: '草稿', type: 'boolean' },
  {
    key: 'listed',
    label: '在列表中显示',
    type: 'boolean',
    help: '关闭后文章仍可直达，但不出现在博客列表、标签页、订阅源与命令面板',
  },
  { key: 'featured', label: '精选', type: 'boolean' },
  {
    key: 'comments',
    label: '开启评论',
    type: 'boolean',
    help: '关闭后不挂载 Giscus 评论区',
  },
  { key: 'author', label: '作者', type: 'string' },
  {
    key: 'aiLevel',
    label: 'AI 创作标识',
    type: 'select',
    options: [
      { value: 'human', label: '纯人工创作' },
      { value: 'assisted', label: 'AI 辅助润色' },
      { value: 'generated', label: 'AI 完全创作' },
    ],
    help: '展示在文章头部与列表卡片上的创作来源标识，默认为纯人工创作',
  },
  {
    key: 'aiModel',
    label: 'AI 模型',
    type: 'string',
    placeholder: '如 Claude Fable 5',
    help: 'AI 创作标识为非人工级别时展示在徽章上',
  },
  {
    key: 'related',
    label: '相关文章',
    type: 'tags',
    help: '填写其他文章的 id，例如 "hello-world"',
  },
  { key: 'version', label: '版本', type: 'string' },
  {
    key: 'updates',
    label: '更新记录',
    type: 'objectList',
    itemLabel: '更新',
    fields: [
      { key: 'version', label: '版本', type: 'string' },
      { key: 'date', label: '日期', type: 'date' },
      { key: 'summary', label: '摘要', type: 'text' },
    ],
  },
] as const;
