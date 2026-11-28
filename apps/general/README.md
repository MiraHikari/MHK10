# 通用版（经典站点）

`@mhk/general` 是本仓库的站点本体：Astro 7 静态生成 + 单个 React 19 岛，采用
翻页式（fullpage）导航。它面向移动端、触屏和普通浏览，负责完整 HTML、SEO、
`/admin` 内容管理与可选的图片对象存储。

本应用与 [`apps/desktop`](../desktop/README.md)（MHK10 Win95 桌面）是同一批作者
内容的两个互补呈现：经典版是完整可读的站点，桌面版是独立的创意呈现。两边可以
双向切换，经典版不会被强制替换。

公开仓库：<https://github.com/MiraHikari/MHK10>。本应用是其中的 `@mhk/general`
workspace 包；共享作者内容在 `packages/site-core/content`，融合协议与阅读模型在
`packages/site-core/src/fusion`。

## 呈现模式

`PUBLIC_DESK_URL` 指向桌面部署地址时，站点才启用 Win95 呈现；未配置时整体旁路，
恒为经典版。

- 任何设备首次访问都先看到通用版：桌面不会被静默接管。
- 桌面宽屏（≥1024px 且精确指针）在 `/` 会看到醒目的 `DesktopOffer` 入口卡：
  章节色强调、可拖动窗口并打开 Start 的 640×360 实时缩略桌面，以及「进入桌面」
  按钮；接受后才加载 Win95 并记住偏好。手机、窄屏及省流访问只显示一行边缘提示。
- 手机、粗指针设备与 `/projects/` 等深链保持经典版；已保存偏好跟随所有路由。
- 右缘 General / Win95 按钮（classic 手机端位于顶部导航药丸）、命令面板的
  `mode-win95` / `mode-classic`、桌面开始菜单的「Classic Site」都可以双向切换；
  `?view=classic` / `?view=win95` 会显式选择并记住偏好。
- 经典版 HTML 始终完整可读，无 JavaScript 也能浏览内容。

## 技术栈

- **Astro 7**（静态生成，无 Astro 适配器）· **React 19**（单个 `client:load` 岛）
- **TypeScript**（严格模式）· **Tailwind CSS 4** · **MDX**
- **motion** 编排分区过渡，**ogl** 驱动 WebGL 效果
- **Vite+**（`vp`）负责测试与 lint；npm workspaces 管理依赖
- 图片可选托管到 Cloudflare R2 或任意 S3 兼容存储；`/admin` 通过 GitHub API
  写共享内容

## 命令

在仓库根目录执行：

```sh
npm ci
npm run dev:general                 # 仅通用版，http://127.0.0.1:4321
npm run dev                         # 通用版 4321 + 桌面版 4322
npm run build:general               # 静态构建 → apps/general/dist
npm run preview                     # 预览两个已完成构建（4321 / 4322）

npm run check --workspace @mhk/general   # astro check + tsc --noEmit
npm test --workspace @mhk/general        # Vitest
npm run lint --workspace @mhk/general

npm run images:optimize --workspace @mhk/general  # 生成 1920px 长边 display WebP
npm run images:sync --workspace @mhk/general      # public/images → 对象存储（默认 dry-run）
npm run fonts:subset --workspace @mhk/general     # 中文字体子集化（需要 Python）
```

根目录 `npm run verify` 会运行整个 workspace 的诊断、lint、格式、架构、内容
新鲜度、测试、构建、桌面站点校验与 Chromium 场景。提交前至少运行受影响应用的
`check`、`test` 与 `build:general`。

预览使用 `npm run preview`（根脚本基于 Vite+ 静态预览，服务 `apps/general/dist`），
不需要先启动 `astro preview`。

## 目录结构

- `src/pages/` — 路由；`index.astro` 挂载 App 岛，`[section].astro` 生成分区直链页
- `src/components/` — UI（`blog/`、`effects/`、`sections/`、`seo/`、`ui/`、`embed/`）
- `src/hooks/` — 浏览器逻辑与 fullpage 导航
- `src/lib/` — 领域逻辑（分区定义、命令注册表、动效 token、博客、图片 URL、kounter）
- `src/admin/` — `/admin` 内容管理后台
- `src/data/profile.ts`、`src/data/privacy.ts` — 从共享数据派生的类型与文案
- `scripts/` — 图片优化、对象存储同步与中文字体子集化
- `public/` — favicon、`bgm.mp3` 与本地图片同步源

共享作者内容在 `packages/site-core/content`：

- `profile.json` — 个人文案、技能/荣誉、Gallery 元数据与友链；`src/data/profile.ts`
  读取并派生
- `projects/*.md` — 项目卡片（Astro `projects` collection）
- `blog/*.mdx` — 博客文章（Astro `blog` collection 与 `.md` 源端点）
- `packages/site-core/src/fusion` — 通过 `@mhk/site-core/fusion/*` 提供融合协议、
  阅读模型与存储接口

后台与手工维护只改共享作者文件；`projects.generated.json`、桌面画像与
`/images/` 副本由根目录 `npm run content:align` 生成，`npm run content:check`
检查漂移。新增分区仍需两步：在 `src/lib/sections.ts` 定义章节，再在
`src/components/sectionsRegistry.tsx` 补充 lazy loader 与映射。

## 内容替换（fork 场景）

仓库跟踪的是**模板（演示）内容**，可以直接构建和测试。想要换成自己的内容，
不要改模板本身，而是把整条记录放进被 `.gitignore` 忽略的本地覆盖：

| 模板（跟踪）                               | 本地覆盖（gitignore）                              |
| ------------------------------------------ | -------------------------------------------------- |
| `packages/site-core/content/profile.json`  | `packages/site-core/content/local/profile.json`    |
| `packages/site-core/content/projects/*.md` | `packages/site-core/content/local/projects/*.md`   |
| `packages/site-core/content/blog/*.mdx`    | `packages/site-core/content/local/blog/*.{md,mdx}` |

覆盖是整条替换，不做深度合并。改完运行 `npm run content:align` 重新生成投影，
并提交生成结果。机制的完整说明见
[`packages/site-core/content/README.md`](../../packages/site-core/content/README.md)。

## 图片与后台

图片是可选的：不配置对象存储时，`resolveImageSrc()` 回退到同源的
`apps/general/public/images/`，本地开发无需联网。

- 渲染层由 `src/lib/images/url.ts` 的 `resolveImageSrc()` 按
  `PUBLIC_IMAGE_BASE_URL` 拼接地址；数据层始终写站内 `/images/...` 路径。
- `apps/general/public/images/` 是原图的本地镜像，已被 `.gitignore` 忽略，
  新克隆和 CI 中不存在。原图以对象存储为准，经 `PUBLIC_IMAGE_BASE_URL` 提供。
- 展示派生图（长边 1920px 的 WebP）由 `npm run images:optimize` 生成；
  桌面版 `/images/` 只跟踪展示 WebP 与本地 VGA 预览，大型相机原图不随仓库分发。
- `public/` 只保留必须同源的资源：favicon 与 `bgm.mp3` 等。

`/admin` 是 client-only 的 React 后台，使用 GitHub fine-grained PAT 写
`your-org/your-content-repo` 的 `main`，可写路径为
`packages/site-core/content/blog/`、`packages/site-core/content/projects/`、
`packages/site-core/content/profile.json` 与 `apps/general/public/images/`。
图片二进制可直传 S3 兼容对象存储，元数据仍随 Git commit 保存。保存后由你的
托管方按常规流程重新构建。详见 [后台手册](./docs/admin-guide.md)。

## 部署与配置

通用版是普通静态 Astro 构建：`npm run build:general` 输出 `apps/general/dist/`
（各路由 HTML、`_astro/`、字体、`robots.txt`、`llms.txt`、RSS/Atom 与 sitemap）。
仓库内没有 Astro 适配器或托管商配置；把 `dist/` 交给任意静态托管或 CDN 即可。

构建环境变量：

- `PUBLIC_SITE_ORIGIN` — 本站规范 origin，用于 canonical、sitemap 与 RSS；
  未设置时回退 `https://www.example.com`
- `PUBLIC_IMAGE_BASE_URL` — 对象存储只读基座；未配置时回退同源图片
- `PUBLIC_DESK_URL` — Win95 桌面地址；留空则完全旁路 Win95 模式
- `PUBLIC_KOUNTER_URL` — 可选，覆盖默认的访问计数器地址
- `PUBLIC_GISCUS_*` — 可选的 giscus 评论配置
- `R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` — 仅本地
  `images:sync` 使用；后台凭据由管理员在浏览器中输入

完整变量与部署说明见 [docs/deployment.md](./docs/deployment.md) 和
`apps/general/.env.example`。

## 文档

- [docs/README.md](./docs/README.md) — 文档地图
- [docs/architecture.md](./docs/architecture.md) — 架构与扩展点
- [docs/style-system.md](./docs/style-system.md) — 样式 token 分类与归属
- [docs/typography.md](./docs/typography.md) — 字体角色与加载
- [docs/motion-language.md](./docs/motion-language.md) — 动效叙事
- [docs/r2-images.md](./docs/r2-images.md) — 图片对象存储架构与工作流
- [docs/deployment.md](./docs/deployment.md) — 部署、环境变量与运维
- [docs/blog-publishing.md](./docs/blog-publishing.md) — 博客内容与发布
- [docs/giscus-setup.md](./docs/giscus-setup.md) — 评论系统配置
- [docs/admin-guide.md](./docs/admin-guide.md) — `/admin` 操作手册
