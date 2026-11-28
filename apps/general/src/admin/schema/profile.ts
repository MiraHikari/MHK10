import type { FieldSchema } from './types';

// 技能分类可选项，与 skillCategories 中的 id 保持一致。
const SKILL_CATEGORY_OPTIONS = [
  { value: 'CORE', label: 'CORE' },
  { value: 'FRONTEND', label: 'FRONTEND' },
  { value: 'BACKEND', label: 'BACKEND' },
  { value: 'DATA & AI', label: 'DATA & AI' },
  { value: 'DESKTOP & SYSTEM', label: 'DESKTOP & SYSTEM' },
  { value: 'HARDWARE & EMBEDDED', label: 'HARDWARE & EMBEDDED' },
  { value: 'WEB3', label: 'WEB3' },
  { value: 'TOOLS & PLATFORM', label: 'TOOLS & PLATFORM' },
] as const;

/** `profile.json` 各节的字段定义（后台个人资料面板的分区单一来源）。 */
export const PROFILE_SECTION_SCHEMAS: Record<
  string,
  { label: string; schema: readonly FieldSchema[]; singleton?: boolean }
> = {
  birthday: {
    label: '生日',
    singleton: true,
    schema: [{ key: 'birthday', label: '生日', type: 'date', required: true }],
  },
  skillsQuote: {
    label: '技能引言',
    singleton: true,
    schema: [{ key: 'skillsQuote', label: '技能引言', type: 'text', required: true }],
  },
  profile: {
    label: '个人资料',
    singleton: true,
    schema: [
      { key: 'name', label: '名称', type: 'string', required: true },
      { key: 'label', label: '职位标签', type: 'string', required: true },
      { key: 'heroLine', label: '首屏标语', type: 'string', required: true },
      { key: 'location', label: '所在地', type: 'string', required: true },
      { key: 'email', label: '邮箱', type: 'string', required: true },
      { key: 'website', label: '网站', type: 'string', required: true },
      { key: 'github', label: 'GitHub', type: 'string', required: true },
      { key: 'bilibili', label: 'Bilibili', type: 'string', required: true },
      { key: 'avatar', label: '头像路径', type: 'string', required: true },
      { key: 'avatarAlt', label: '头像说明', type: 'string', required: true },
      { key: 'summary', label: '简介', type: 'text', required: true },
      { key: 'introduction', label: '个人介绍', type: 'text', required: true },
      { key: 'detail', label: '详细介绍', type: 'text', required: true },
      {
        key: 'specialties',
        label: '专长标签',
        type: 'tags',
        required: true,
      },
    ],
  },
  beian: {
    label: '备案信息',
    singleton: true,
    schema: [
      { key: 'icp', label: 'ICP 备案', type: 'string', required: true },
      { key: 'police', label: '公安备案', type: 'string', required: true },
    ],
  },
  aboutCurrently: {
    label: '当前动态',
    schema: [
      {
        key: 'aboutCurrently',
        label: '当前动态',
        type: 'objectList',
        itemLabel: '动态',
        fields: [
          { key: 'label', label: '标签', type: 'string', required: true },
          { key: 'value', label: '内容', type: 'string', required: true },
        ],
      },
    ],
  },
  aboutJourney: {
    label: '历程',
    schema: [
      {
        key: 'aboutJourney',
        label: '历程',
        type: 'objectList',
        itemLabel: '节点',
        fields: [
          { key: 'year', label: '年份', type: 'string', required: true },
          { key: 'title', label: '标题', type: 'string', required: true },
          {
            key: 'description',
            label: '描述',
            type: 'text',
            required: true,
          },
        ],
      },
    ],
  },
  aboutPrinciples: {
    label: '原则',
    schema: [
      {
        key: 'aboutPrinciples',
        label: '原则',
        type: 'objectList',
        itemLabel: '原则',
        fields: [
          { key: 'title', label: '标题', type: 'string', required: true },
          { key: 'greek', label: '希腊文', type: 'string' },
          { key: 'zh', label: '中文名', type: 'string' },
          {
            key: 'description',
            label: '描述',
            type: 'text',
            required: true,
          },
        ],
      },
    ],
  },
  education: {
    label: '教育经历',
    schema: [
      {
        key: 'education',
        label: '教育经历',
        type: 'objectList',
        itemLabel: '经历',
        fields: [
          {
            key: 'institution',
            label: '学校',
            type: 'string',
            required: true,
          },
          { key: 'area', label: '专业/班级', type: 'string', required: true },
          {
            key: 'startDate',
            label: '开始日期',
            type: 'string',
            required: true,
          },
          {
            key: 'endDate',
            label: '结束日期',
            type: 'string',
            help: '为空表示至今',
          },
          { key: 'current', label: '当前在读', type: 'boolean' },
        ],
      },
    ],
  },
  experiences: {
    label: '工作经历',
    schema: [
      {
        key: 'experiences',
        label: '工作经历',
        type: 'objectList',
        itemLabel: '经历',
        fields: [
          { key: 'name', label: '公司/组织', type: 'string', required: true },
          { key: 'position', label: '职位', type: 'string', required: true },
          { key: 'location', label: '地点', type: 'string', required: true },
          { key: 'url', label: '链接', type: 'string' },
          {
            key: 'startDate',
            label: '开始日期',
            type: 'string',
            required: true,
          },
          {
            key: 'endDate',
            label: '结束日期',
            type: 'string',
            help: '为空表示至今',
          },
          { key: 'current', label: '当前在职', type: 'boolean' },
          {
            key: 'summary',
            label: '总结',
            type: 'text',
            required: true,
          },
          {
            key: 'highlights',
            label: '亮点',
            type: 'stringList',
            itemLabel: '亮点',
          },
          { key: 'stack', label: '技术栈', type: 'tags' },
        ],
      },
    ],
  },
  certificates: {
    label: '证书',
    schema: [
      {
        key: 'certificates',
        label: '证书',
        type: 'objectList',
        itemLabel: '证书',
        fields: [
          { key: 'name', label: '名称', type: 'string', required: true },
          { key: 'issuer', label: '颁发机构', type: 'string', required: true },
          { key: 'date', label: '日期', type: 'string', required: true },
        ],
      },
    ],
  },
  languages: {
    label: '语言',
    schema: [
      {
        key: 'languages',
        label: '语言',
        type: 'objectList',
        itemLabel: '语言',
        fields: [
          { key: 'language', label: '语言', type: 'string', required: true },
          {
            key: 'fluency',
            label: '熟练度',
            type: 'string',
            required: true,
          },
        ],
      },
    ],
  },
  skillCategories: {
    label: '技能分类',
    schema: [
      {
        key: 'skillCategories',
        label: '技能分类',
        type: 'objectList',
        itemLabel: '分类',
        fields: [
          { key: 'id', label: 'ID', type: 'string', required: true },
          { key: 'label', label: '显示名', type: 'string', required: true },
          {
            key: 'description',
            label: '描述',
            type: 'string',
            required: true,
          },
        ],
      },
    ],
  },
  skills: {
    label: '技能',
    schema: [
      {
        key: 'skills',
        label: '技能',
        type: 'objectList',
        itemLabel: '技能',
        fields: [
          { key: 'name', label: '名称', type: 'string', required: true },
          {
            key: 'level',
            label: '熟练度',
            type: 'number',
            required: true,
            min: 0,
            max: 100,
            help: '0-100',
          },
          {
            key: 'category',
            label: '分类',
            type: 'select',
            required: true,
            options: SKILL_CATEGORY_OPTIONS,
          },
          { key: 'years', label: '年限', type: 'number' },
          { key: 'note', label: '备注', type: 'string' },
          {
            key: 'icon',
            label: '图标',
            type: 'string',
            help: 'iconify 名，如 simple-icons:typescript',
          },
          { key: 'keywords', label: '关键词', type: 'tags' },
        ],
      },
    ],
  },
  skillsCurrentlyLearning: {
    label: '正在学习',
    schema: [
      {
        key: 'skillsCurrentlyLearning',
        label: '正在学习',
        type: 'objectList',
        itemLabel: '技能',
        fields: [
          { key: 'name', label: '名称', type: 'string', required: true },
          {
            key: 'level',
            label: '熟练度',
            type: 'number',
            required: true,
            min: 0,
            max: 100,
            help: '0-100',
          },
          {
            key: 'category',
            label: '分类',
            type: 'select',
            required: true,
            options: SKILL_CATEGORY_OPTIONS,
          },
          { key: 'years', label: '年限', type: 'number' },
          { key: 'note', label: '备注', type: 'string' },
          {
            key: 'icon',
            label: '图标',
            type: 'string',
            help: 'iconify 名，如 simple-icons:typescript',
          },
          { key: 'keywords', label: '关键词', type: 'tags' },
        ],
      },
    ],
  },
  honors: {
    label: '荣誉奖项',
    schema: [
      {
        key: 'honors',
        label: '荣誉奖项',
        type: 'objectList',
        itemLabel: '奖项',
        fields: [
          { key: 'title', label: '标题', type: 'string', required: true },
          { key: 'issuer', label: '颁发机构', type: 'string', required: true },
          { key: 'issuerShort', label: '机构简称', type: 'string' },
          { key: 'date', label: '日期', type: 'string', required: true },
          { key: 'level', label: '级别描述', type: 'string', required: true },
          {
            key: 'tier',
            label: '层级',
            type: 'select',
            required: true,
            options: [
              { value: 'national', label: '国家级' },
              { value: 'provincial', label: '省级' },
              { value: 'city', label: '市级' },
            ],
          },
          {
            key: 'kind',
            label: '类型',
            type: 'select',
            options: [
              { value: 'competition', label: '竞赛' },
              { value: 'industry', label: '行业' },
            ],
          },
          { key: 'highlight', label: '高亮', type: 'boolean' },
          {
            key: 'description',
            label: '描述',
            type: 'text',
            required: true,
          },
          { key: 'imageSrc', label: '图片路径', type: 'string' },
          { key: 'downloadSrc', label: '下载图路径', type: 'string' },
          { key: 'imageAlt', label: '图片说明', type: 'string' },
          { key: 'sourceUrl', label: '来源链接', type: 'string' },
          { key: 'sourceLabel', label: '来源标签', type: 'string' },
        ],
      },
    ],
  },
  galleryItems: {
    label: '图库',
    schema: [
      {
        key: 'galleryItems',
        label: '图库',
        type: 'objectList',
        itemLabel: '图片',
        fields: [
          { key: 'title', label: '标题', type: 'string', required: true },
          { key: 'location', label: '地点', type: 'string', required: true },
          { key: 'year', label: '年份', type: 'string', required: true },
          {
            key: 'date',
            label: '日期',
            type: 'string',
            required: true,
            help: 'ISO 如 2026-07-20T09:15:00+08:00',
          },
          {
            key: 'dateLabel',
            label: '日期显示文本',
            type: 'string',
            required: true,
          },
          {
            key: 'datePrecision',
            label: '日期精度',
            type: 'select',
            required: true,
            options: [
              { value: 'year', label: '年' },
              { value: 'month', label: '月' },
              { value: 'date', label: '日' },
              { value: 'datetime', label: '日期时间' },
            ],
          },
          { key: 'order', label: '排序', type: 'number', required: true },
          { key: 'category', label: '分类', type: 'string', required: true },
          {
            key: 'imageSrc',
            label: '图片路径',
            type: 'string',
            required: true,
          },
          { key: 'downloadSrc', label: '下载图路径', type: 'string' },
          {
            key: 'imageAlt',
            label: '图片说明',
            type: 'string',
            required: true,
          },
          { key: 'width', label: '宽度', type: 'number', required: true },
          { key: 'height', label: '高度', type: 'number', required: true },
        ],
      },
    ],
  },
  friendLinks: {
    label: '友情链接',
    schema: [
      {
        key: 'friendLinks',
        label: '友情链接',
        type: 'objectList',
        itemLabel: '友链',
        fields: [
          { key: 'name', label: '网站名称', type: 'string', required: true },
          {
            key: 'url',
            label: '网站 URL',
            type: 'string',
            required: true,
            placeholder: 'https://example.com',
          },
          { key: 'description', label: '网站描述', type: 'text', required: true },
          {
            key: 'group',
            label: '分组',
            type: 'select',
            options: [
              { value: '', label: '普通友链' },
              { value: 'close', label: '多年挚友' },
            ],
            help: '特殊分组的视觉在代码中映射；未知分组 id 前台按普通友链展示',
          },
          {
            key: 'favicon',
            label: '图标路径',
            type: 'string',
            help: '留空自动抓取对方站点 /favicon.ico；可填 /images/friends/xxx.webp 或完整外链',
          },
          {
            key: 'addedAt',
            label: '收录日期',
            type: 'date',
            help: 'YYYY-MM-DD，同组内新的在前；留空视为最早',
          },
        ],
      },
    ],
  },
  // honorTierMeta 是派生自荣誉层级的常量元数据，后台不直接编辑。
};
