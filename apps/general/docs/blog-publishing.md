# 博客内容创作与发布规范

本文说明博客文章的生命周期：内容模型、草稿与发布流程、frontmatter 字段、
AI 披露、系列文与版本更新、相关文章、机器可读出口及隐私页维护。
评论配置见 [`giscus-setup.md`](./giscus-setup.md)，插图与图片管线见
[`r2-images.md`](./r2-images.md)，本文不重复两者的内容。

## 内容模型概述

一篇文章 = frontmatter 元数据 + MDX 正文，存放于 `packages/site-core/content/blog/`
（`*.md` / `*.mdx`，由 `src/content.config.ts` 的 `glob` loader 收录）。
frontmatter 经 zod schema 校验，是列表、标签、订阅源、命令面板、AI 披露与
SEO（JSON-LD / OG）的单一数据来源；正文可通过 MDX 直接 import 站点组件
（如 `PhotoFigure`、`EditorialNote`）。

文章 id 即相对路径（去扩展名），同时用作 URL slug 与 Giscus Discussion 的
`term`（评论机制见 `giscus-setup.md`）。后台编辑器的字段表单定义在
`src/admin/schema/blog.ts`，与内容 schema 的差异见「字段速查表」一节。

发布链路：新增文章 → 上传插图 → 提交（后台或 git）→ 托管平台重新构建，
通常一两分钟后线上生效（具体取决于你的托管配置）。

## 发布 / 撤回 / 草稿流程

| 状态 | 操作                           | 效果                                                                                 |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------ |
| 草稿 | `draft: true`                  | 本地 dev 可预览（`/blog/<slug>/` 可访问）；生产构建不生成页面与 `.md` 端点，直达 404 |
| 发布 | `draft: false`（或省略）       | 进入全部收录出口（见「收录规则总表」）                                               |
| 撤回 | 改回 `draft: true`，或删除文件 | 列表与订阅源即时消失，生产直达 404                                                   |

- `getAllPosts()`（`src/lib/blog/index.ts`）以 `import.meta.env.PROD` 门控
  draft：dev 返回全部文章（含草稿），生产只返回 `draft !== true`。
- 后台（`/admin` 博客面板，`src/admin/ui/panels/BlogPanel.tsx`）新建文章默认
  `draft: true`，表单可切换草稿开关；保存即向 GitHub 提交并触发部署。
- 内容集合校验错误（字段类型、必填缺失）会在 `npm run dev:general` / `npm run build:general` 时
  直接报错，发布前务必本地跑一次构建。

## frontmatter 字段速查表

字段定义以共享的 `packages/site-core/src/content-model/article-schema.ts`（`articleSchema`）为准；`src/content.config.ts` 只选择发布日期键与默认值：

| 字段          | 类型                         | 必填 | 默认           | 语义                                                                                                                   |
| ------------- | ---------------------------- | ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `title`       | string                       | 是   | —              | 文章标题                                                                                                               |
| `description` | string                       | 是   | —              | 摘要：列表卡片、订阅源、命令面板、JSON-LD 共用                                                                         |
| `publishDate` | date（`z.coerce`）           | 是   | —              | 发布日期；全站文章排序基准（倒序）                                                                                     |
| `updatedDate` | date                         | 否   | —              | 更新日期；用于 Atom `<updated>`、JSON-LD `dateModified`                                                                |
| `tags`        | string[]                     | 否   | `[]`           | 标签；标签页与命令面板 `:tag` 检索                                                                                     |
| `category`    | string                       | 否   | —              | 分类（现有取值如 `Essay` / `Engineering` / `Legal`）；用于水印文案与相关推荐，英文标签映射见 `src/lib/category-map.ts` |
| `heroImage`   | string                       | 否   | —              | OG 分享卡路径（`/images/og/...`，经 `resolveImageSrc` 解析，缺省回退 `default.webp`）                                  |
| `heroAlt`     | string                       | 否   | —              | 封面图说明                                                                                                             |
| `draft`       | boolean                      | 否   | `false`        | 草稿开关（见发布流程）                                                                                                 |
| `listed`      | boolean                      | 否   | `true`         | `false`：仍可直达，但不出现在列表 / 标签 / 订阅源 / 命令面板                                                           |
| `featured`    | boolean                      | 否   | `false`        | 精选标记；`getFeaturedPosts()` 提供查询入口，当前 UI 尚无消费点                                                        |
| `comments`    | boolean                      | 否   | `true`         | `false`：不挂载 Giscus 评论区（如隐私页）                                                                              |
| `author`      | string                       | 否   | `profile.name` | 作者显示名                                                                                                             |
| `aiLevel`     | enum                         | 否   | `human`        | `generated` / `assisted` / `human`（见 AI 披露规则）                                                                   |
| `aiModel`     | string                       | 否   | —              | 参与的 AI 模型名；aiLevel 非 human 时展示                                                                              |
| `related`     | string[]                     | 否   | `[]`           | 显式相关文章 id（见「相关文章」）                                                                                      |
| `series`      | string                       | 否   | —              | 系列名（如「杭州行记」），文末展示系列导航                                                                             |
| `seriesOrder` | number                       | 否   | —              | 系列内序号；缺省按 `publishDate` 排序                                                                                  |
| `version`     | string                       | 否   | —              | 当前编辑版本号（展示在文章元信息旁）                                                                                   |
| `updates`     | `{version, date, summary}[]` | 否   | `[]`           | 编辑历史；展示时按 `date` 倒序                                                                                         |

后台差异（`src/admin/schema/blog.ts`）：**`series` / `seriesOrder` 未纳入后台
表单**，设置系列文需直接编辑源文件；其余字段一一对应（`aiLevel` 为下拉，
`related` 以标签形式录入文章 id）。

## AI 披露规则

- 取值与文案单一来源：`src/lib/blog/ai.ts` 的 `AI_LEVEL_META`——`generated`
  （AI GENERATED / AI 创作）、`assisted`（AI ASSISTED / AI 辅助润色）、
  `human`（HUMAN WRITTEN / 纯人工创作），各带完整披露语句。
- `aiModel` 在 schema 中**不强制**：非 human 时展示在徽章与披露语句中，
  缺省以「AI」兜底；建议非 human 文章务必填写。
- 前台呈现：文章头部徽章（`AIGenBadge`）、列表卡片标识、版权块
  （`ArticleCopyright`，非 human 时追加 `AI_LEGAL_NOTE`）与 JSON-LD
  `creditText`。
- 机器出口：`.md` 源端点与 llms.txt 均带 AI 声明（见下两节）。

## 系列文与版本更新

- 系列导航：`buildSeriesNav()`（`src/lib/blog/series.ts`）按 `series` 分组，
  组内按 `seriesOrder` 升序 → `publishDate` 升序 → id 稳定排序；当前文章文末
  展示系列名 / 篇数 / 条目列表与相邻篇目。
- 系列导航仅对 `listed: true` 的文章构建；未收录文章的 `seriesNav` 为
  `undefined`，也不会出现在其他文章的系列组里。
- `version` 只作当前版本展示；`updates` 为变更历史，`toPost()` 按日期倒序
  渲染，与 frontmatter 书写顺序无关。完整示例见 `packages/site-core/content/blog/colophon.mdx`
  （`version: "2.0.0"` 配四条 `updates`）。

## 相关文章

- 推荐来源（`scoreRelatedPosts`，`src/lib/blog/index.ts`）：显式 `related` id
  （+100）、正文内 `/blog/<id>` 链接（+24）、被引用回链（+12）、同分类（+6）、
  共享标签（每个 +3）；取分 > 0 的前 3 篇。
- 显式 `related` 指向未知 id 时，构建 / dev 控制台输出
  `[blog] Unknown related id "..." in frontmatter of "..."` 警告——这是发现
  slug 拼写错误的主要信号，发布前留意。
- 关系解析只落到 `listed: true` 的文章；指向未收录文章的 `related` 不会展示。

## Markdown 源端点

`/blog/<slug>.md`（`src/pages/blog/[...slug].md.ts`）返回**原始 MDX 源文件**
（保留 YAML frontmatter 与组件 import），并自动追加声明块：

- 版权行（`copyrightLine()`）、CC BY-NC-SA 4.0 许可链接、转载须知
  （`REPRINT_NOTE`）与规范页面 URL；
- aiLevel 非 human 时追加「创作来源：`<级别标签>` — `<披露语句>`」。

版权声明的单一事实来源是 `src/lib/blog/legal.ts`（页脚版权块、JSON-LD、
RSS/Atom 与导出共用），修改许可条款只改这一处。响应头：
`Content-Type: text/markdown; charset=utf-8`、`Cache-Control: must-revalidate`、
`Link` canonical。消费方：llms.txt 的文章链接与文章分享区「复制 MD」
（`ArticleShareActions` 对 `/blog/${slug}.md` 的 fetch）；
`enhanceArticleLinks` 对 `.md` 链接保持原生跳转。draft 文章在生产的该端点
同样 404。

## 收录规则总表

| 出口                               | `draft: true`           | `listed: false`  | 实现位置                                                                              |
| ---------------------------------- | ----------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| 直达页面 `/blog/<slug>/`           | dev 可访问，prod 不生成 | 可访问           | `src/pages/blog/[...slug].astro`（`getStaticPaths` 用 `getAllPosts`）                 |
| 博客列表 / 标签页                  | 排除                    | 排除             | `BlogSection` 按 `a.listed` 过滤                                                      |
| RSS / Atom 订阅源                  | 排除                    | 排除             | `src/pages/rss.xml.ts` / `src/pages/atom.xml.ts`（`!data.draft && listed !== false`） |
| llms.txt                           | 排除                    | 排除             | `src/pages/llms.txt.ts`（`getListedPosts`）                                           |
| 命令面板文章搜索（`:blog` 与全文） | 排除                    | 排除             | `CommandPalette` 的 `listedArticles` 过滤                                             |
| 站点地图                           | prod 无页面即无条目     | 包含（页面存在） | `astro.config.ts` 的 sitemap 仅排除 `/admin` 与 `/article-fragments/`                 |

llms.txt 中每篇收录文章链接到 `.md` 源端点，行内附摘要、标签、发布 / 更新
日期（描述末尾的句号 / 分号等标点会被去除）。

## 插图规范

封面与正文插图遵循 [`r2-images.md`](./r2-images.md) 的图片管线，要点：

- 封面（`heroImage`）：OG 卡片放 `images/og/`（成品图，不参与派生流程），
  未配置时回退 `default.webp`。
- 正文照片：统一 `PhotoFigure`（单张）/ `PhotoSet`（成组）组件，图片放
  `apps/general/public/images/blog/<slug>/` 子目录，`npm run images:optimize --workspace @mhk/general` 生成
  `-display.webp`（1920 长边）后 `npm run images:sync --workspace @mhk/general -- --apply` 上传 R2；
  `enhanceArticleImages` 在客户端把图注 / 原图 / 拍摄时间提升为灯箱条目。
- 字段级约定（`src` / `full` / `caption` / `width` / `height` 等）与后台直传
  流程见 [`r2-images.md`](./r2-images.md)「博客正文插图」，不再赘述。

## 隐私页维护

- 位置：`packages/site-core/content/blog/privacy.mdx`（`listed: false`、`comments: false`、
  category `Legal`）；`/privacy` 由 `src/pages/privacy.astro` 301 重定向到
  `/blog/privacy`。
- 入口：页脚 `BeianFooter` 与移动抽屉 `Navigation`
  （`src/components/chrome/`），slug 常量 `PRIVACY_ARTICLE_SLUG` 定义在
  `src/lib/blog/client.ts`。
- **Storage key 契约**：本机存储键的单一来源是 `src/lib/storage/keys.ts` 的
  `STORAGE_CATALOG`；隐私表格由 `PrivacyArticle` 从 `src/data/privacy.ts` 的
  `STORAGE_KEY_PURPOSES` 渲染，`src/lib/storage/privacy-inventory.test.ts`
  断言目录中每个 key 都有对应的双语文案。`privacy.mdx` 只承载 frontmatter
  与正文说明注释，隐私 slug 的正文由 `ArticleView` 渲染 `<PrivacyArticle />`，
  文案本身在 `src/data/privacy.ts`；新增 / 删除存储键时必须同步 `keys.ts` 与
  `src/data/privacy.ts`，否则 `npm test --workspace @mhk/general` 失败。

## 验证清单

改动文章或博客代码后：

1. 静态检查：`npm run check --workspace @mhk/general && npm test --workspace @mhk/general`；涉及内容集合
   schema、路由或依赖时再加 `npm run build:general`。
2. `npm run dev:general` 浏览器 QA：
   - 新文章直达页、列表卡片、标签页、命令面板 `:blog` / `:tag` 检索；
   - 系列文文末导航与相邻篇目、文章底部 prev（旧）/ next（新）方向；
   - 版权块与 AI 徽章（非 human 文章）、「复制 MD」内容包含声明块；
   - 控制台无 `Unknown related id` 警告、无 404 图片。
3. 机器出口抽查：`/blog/<slug>.md`、`/llms.txt`、`/rss.xml`、`/atom.xml`
   与「收录规则总表」一致。
