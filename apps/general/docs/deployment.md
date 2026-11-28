# 部署、CI 与运维

本文描述通用版的通用静态部署链路、CI 步骤、构建产物、SEO 输出、环境变量与
故障排查。本文不绑定任何具体托管商：把静态产物交给任意静态托管或 CDN 即可。
架构机制见 [`architecture.md`](./architecture.md)；图片管线见
[`r2-images.md`](./r2-images.md)，评论系统见 [`giscus-setup.md`](./giscus-setup.md)。

## 工作区与部署拓扑

本仓库是 npm workspace，包含两个静态 Astro 应用与一个共享包：

| 项目             | 目录 / 包                                | 角色                                                         |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------ |
| 通用版（A 站）   | `apps/general`（`@mhk/general`）         | fullpage 经典站；完整 SSR HTML（SEO 面）、`/admin`、图片管线 |
| Win95 版（B 站） | `apps/desktop`（`@mhk/desktop`）         | MHK10 像素桌面；纯静态 MPA                                   |
| 共享包           | `packages/site-core`（`@mhk/site-core`） | 作者内容、融合协议与阅读模型                                 |

- 通用版可经 `Win95Embed` 全屏 iframe 嵌入桌面 `/?shell=full`；机制见
  [`architecture.md`](./architecture.md)「显示模式系统」与
  [`apps/desktop/docs/dual-presentation.md`](../../desktop/docs/dual-presentation.md)。
- 联动开关只有通用版的 `PUBLIC_DESK_URL`：未配置时 Win95 模式整体旁路，
  通用版独立可用。任何设备首次访问都先看到通用版；桌面宽屏在 `/` 会看到
  Hero 旁的推荐卡，接受后才进入 Win95，且可随时切回。
- 两个应用是互补呈现，共享 `packages/site-core/content` 的作者事实，但各自
  构建、部署和保存边界独立。

## 构建与托管

两个应用都是普通 Astro 静态构建，仓库内没有 Astro 适配器、托管商清单或
平台专属产物。

| 目标     | 根目录命令              | 输出                 |
| -------- | ----------------------- | -------------------- |
| 通用版   | `npm run build:general` | `apps/general/dist/` |
| Win95 版 | `npm run build:desktop` | `apps/desktop/dist/` |
| 两个应用 | `npm run build`         | 上述两个目录         |

建议的构建步骤（Node 24、npm 11、仓库唯一的 `package-lock.json`）：

```sh
npm ci
npm run content:align   # 共享内容有变更时；或提交已更新的生成文件
npm run build:general   # B 站改为 npm run build:desktop
```

托管方式可以是 Nginx、S3 + CDN、Cloudflare Pages、Netlify、Vercel、GitHub
Pages 或自建服务器。把 `apps/general/dist/`（桌面版为 `apps/desktop/dist/`）
作为站点根目录发布即可。

- `npm run build` 本身不运行 `content:align`。若托管构建未执行该步骤，
  `packages/site-core/content/projects.generated.json`、桌面画像与
  `/images/` 副本必须已在 Git 中保持最新。
- `content:align` / `content:check` 在有本地图片镜像时也会刷新/校验展示副本；
  镜像 `apps/general/public/images/` 已被 `.gitignore` 忽略，新克隆/CI 中没有。
  只有生成输出已提交时，缺少镜像的构建才可继续。
- 通用版构建环境变量见下文；Win95 版变量见 `apps/desktop/.env.example`。

## CI（GitHub Actions）

配置：仓库根目录 `.github/workflows/verify.yml`。触发条件：所有 push 与
Pull Request。

| 属性     | 值                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| 运行环境 | `windows-latest`                                                                                                    |
| Node     | `.node-version`（24.x）                                                                                             |
| 缓存     | npm                                                                                                                 |
| 步骤     | `npm ci` → `npx playwright install chromium` → `npm run verify`                                                     |
| 失败证据 | `playwright-report/`、`test-results/`、`apps/desktop/playwright-report/`、`apps/desktop/test-results/`（保留 7 天） |

`npm run verify` 依次运行：`check`（全 workspace 诊断）、`lint`、
`format:check`、`verify:architecture`、`content:check`、`test`（Vitest）、
`build`、`verify:site`（两站生成校验）、`build:verify`、`test:e2e`
（桌面 Chromium）与 `test:e2e:fusion`（通用站及跨源联动）。验证构建只写
`.verify/`；上线使用 `apps/general/dist` 与 `apps/desktop/dist`。

若你的托管平台不使用 GitHub Actions，把同样的命令放进平台的构建步骤即可；
关键是把 Node 版本固定为 24，并在构建前准备好共享内容。

## 构建产物

`npm run build:general` 输出到 `apps/general/dist/`：

| 内容               | 示例                                                       |
| ------------------ | ---------------------------------------------------------- |
| 各路由 HTML        | `index.html`、`about/index.html`、`blog/<slug>/index.html` |
| 静态资源           | `_astro/*.js` / `*.css`、字体 woff2、`public/` 资源        |
| 机器可读出口       | `robots.txt`、`llms.txt`、`rss.xml`、`atom.xml`            |
| 站点地图           | `sitemap-index.xml`、`sitemap-0.xml`                       |
| 文章 Markdown 端点 | `blog/<slug>.md`                                           |

`apps/general/public/images/` 是原图的本地镜像，已被 `.gitignore` 忽略，
新克隆与 CI 中不存在。若构建机上存在该目录，Astro 会把它复制到
`dist/images/`；配置 `PUBLIC_IMAGE_BASE_URL` 后，页面图片 URL 指向对象存储。
桌面版 `/images/` 副本已纳入 Git。

## 章节 chunk 预热策略

懒加载章节（About/Projects/Skills/Gallery/Friends，`sectionsRegistry` 的
`React.lazy`）采用构建期注入 + 运行时空闲预载两级策略：

| 层       | 机制                                                                                                        | 位置                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 捕获     | `capture-section-chunks`（Vite 插件）在 client 构建中捕获 `_astro/*Section.*.js`，按根章节 + 注册表顺序排序 | `apps/general/astro.config.ts`                         |
| 注入     | `preload-section-chunks`（Astro 集成）向各 HTML `<head>` 写入 `modulepreload`                               | `apps/general/astro.config.ts`                         |
| 空闲预载 | 其余章节在 `contentReady` 后经 `requestIdleCallback` 预载；省流/2G 跳过                                     | `src/components/App.tsx`、`src/lib/images/prefetch.ts` |

注入规则：

- 每个挂载 App 的页面注入根章节 About（首访 LCP 关键路径）。
- 直链章节页（`/projects`、`/skills`、`/gallery`、`/friends`）额外注入目标
  章节 chunk；目标即根章节时不重复注入。
- 排除 `404.html`、`admin` 与 `article-fragments`。
- 根页/博客页只注入根章节，避免全量 modulepreload 推迟水合。

修改 `sectionsRegistry` 新增章节时，同步更新 `astro.config.ts` 的
`LAZY_SECTION_MODULES` 与 `LAZY_SECTION_BY_PAGE`，并核对构建日志
`Preloaded section chunk(s) in N page(s)`。

## SEO 面

| 输出                                  | 生成规则（源码）                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `robots.txt`                          | `src/pages/robots.txt.ts`：`Allow: /`，`Disallow: /article-fragments/`、`Disallow: /admin`，`Sitemap: /sitemap-index.xml`        |
| `sitemap-index.xml` / `sitemap-0.xml` | `@astrojs/sitemap`（`astro.config.ts`），filter 排除 `/article-fragments/` 与 `/admin`                                           |
| `llms.txt`                            | `src/pages/llms.txt.ts`：基于 `getListedPosts()`，链接指向 `blog/<slug>.md` 源端点                                               |
| `rss.xml`                             | `src/pages/rss.xml.ts`：RSS 2.0，过滤 draft 与 `listed: false`，按 `publishDate` 倒序                                            |
| `atom.xml`                            | `src/pages/atom.xml.ts`：同一过滤与排序                                                                                          |
| 页面 head                             | `src/components/seo/BaseHead.astro`：description、OG、Twitter、canonical、JSON-LD、sitemap/RSS/Atom alternate、图片域 preconnect |

**`/admin` 三重隔离**：`noindex, nofollow` meta + `robots.txt` Disallow +
sitemap filter。

**`listed: false`**：不出现在列表、标签、命令搜索、RSS/Atom 与 llms.txt；
直链仍可访问。`draft: true` 在 PROD 构建不生成页面，dev 下可见。

`src/data/site-origin.ts` 与 `src/lib/canonical-url.ts` 统一公开 URL：目录路径
带尾斜杠，`.xml`、`.md` 等文件端点保留文件名，canonical 去掉 query/hash。
博客页面与 SPA 通过 `src/lib/blog/head-model.ts` 共用完整 head 描述符；客户端
比较标题、meta、作者、标签及 JSON-LD，完整相同才保留 SSR 节点。标签页保留
独立 canonical/title、CollectionPage 和 BreadcrumbList；文章保留许可与版权。
`verify:site` 精确核对生成路径、canonical、sitemap 与 RSS/Atom 的一致性。

> 规范 origin 来自 `PUBLIC_SITE_ORIGIN`。部署到新域名时先设置该变量再构建，
> 否则 canonical、sitemap 与 RSS 会继续使用占位或旧地址。

## 环境变量

| 变量                    | 说明                                                                                   | 使用位置                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `PUBLIC_IMAGE_BASE_URL` | 访客只读图片基座（如 `https://static.example.com`）；未配置时回退同源 `public/images/` | `src/lib/images/url.ts`、`BaseHead.astro`                               |
| `PUBLIC_DESK_URL`       | Win95 桌面地址（如 `https://desk.example.com`）；**留空 → 融合模式整体旁路**           | `useDisplayMode.ts`、`Layout.astro`、`BaseHead.astro`、`Win95Embed.tsx` |
| `PUBLIC_KOUNTER_URL`    | 可选；覆盖默认的访问计数器地址                                                         | `src/lib/kounter/index.ts`                                              |
| `PUBLIC_GISCUS_*`       | 可选；giscus 评论仓库与分类配置                                                        | 评论组件与共享配置                                                      |
| `R2_ENDPOINT`           | S3 virtual-hosted endpoint（含 bucket），本地同步脚本使用                              | `scripts/sync-images.mjs`                                               |
| `R2_ACCESS_KEY_ID`      | 对象存储访问密钥 id                                                                    | 同上                                                                    |
| `R2_SECRET_ACCESS_KEY`  | 对象存储访问密钥 secret                                                                | 同上                                                                    |

- 事实来源：`apps/general/.env.example` 与 [`r2-images.md`](./r2-images.md)。
- `.env`、`.env.production` 已 gitignore；后台凭据由用户输入后存
  `localStorage`，与 `R2_*` 构建变量无关。
- 本地开发可不配 `PUBLIC_IMAGE_BASE_URL`（回退 `apps/general/public/images/`）。
  `images:sync` 通过 `node --env-file-if-exists=.env` 读取凭据。
- 本地融合联调：仓库根目录 `npm run dev` 会自动设置
  `PUBLIC_DESK_URL=http://127.0.0.1:4322`、`PUBLIC_PARENT_ORIGINS=http://127.0.0.1:4321`
  与 `PUBLIC_GENERAL_URL=http://127.0.0.1:4321`。手工启动时端口必须精确一致，
  不能使用 origin 通配符。

### 跨源嵌入清单

桌面项目需同时设置 `PUBLIC_PARENT_ORIGINS=<通用站 origin>`、
`PUBLIC_GENERAL_URL=<通用站 origin>` 和公共图片基座。先部署桌面并确认其
域名可访问，再部署通用站的融合版本。

部署地址在构建与浏览器侧共用 `parseDesktopDeployment`：允许 HTTPS 和明确
localhost 的 HTTP，禁止地址携带凭据、查询或片段。无效 `PUBLIC_DESK_URL`
会旁路桌面入口和预连接，通用站仍可构建、阅读；生产地址应使用 HTTPS。
预览域名需要在桌面的 `PUBLIC_PARENT_ORIGINS` 中显式列出。改变域名或协议后，
重新构建两站并核对实际加载的脚本，旧页面上的配置不会自动改变。

两站独立发布时保留共同的协议版本和消息定义；新版本应继续接受当前版本的
阅读模型。未支持的消息、错误父源和无关 window 被拒绝，无法解读或冲突的
阅读数据保留原文。桌面不可达、被嵌入策略阻断或未在期限内就绪时，20 秒
握手会回到通用版，并保留阅读地址与重试入口。不要用无限延长等待来掩盖故障。
桌面 HTML 的 CSP `frame-ancestors` 必须允许通用站，通用站的 `frame-src`
必须允许桌面；`X-Frame-Options: DENY` / `SAMEORIGIN` 不适用于这两个不同源的
嵌入。

HTML 应短缓存并重新验证；带 hash 的脚本、样式和字体可长缓存。部署应完整
保留旧 hash 资源直到旧 HTML 缓存过期，避免独立发布时出现 chunk 404。检查
HTML 和 JavaScript 的 Content-Type 与压缩响应，不能把 200 的 HTML 回退当作
成功加载的图片或脚本。对象存储图片需检查具体对象地址，桶根页面不是图片
可用性证据。

## 依赖与供应链

- 依赖由 npm workspaces 管理，仓库只有一个 `package-lock.json`；不要在应用内
  新增锁文件或改用 pnpm。
- 根 `package.json` 的 `overrides` 只固定 `vitest` 版本；Vite+ 在自身依赖树中
  嵌套使用 `@voidzero-dev/vite-plus-core`，Astro 使用自己的 `vite` 依赖。
  应用内固定版本（如 `@astrojs/compiler-rs`、`sharp`）按实际安装结果维护。
- 新增依赖需要明确用途、可复现版本与兼容性验证；开发工具不得进入浏览器包。
- 不要把密钥、PAT 或对象存储凭据提交进仓库或写进构建产物。

## 回滚与故障排查

**回滚**：对出错 commit 执行 `git revert` 并 push，重新触发 CI 与托管构建。
对象存储图片与 Git 内容分离：回滚代码不会回滚对象存储中的对象。

| 症状                                      | 排查                                                                                                        | 处理                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CI 失败                                   | 查看 Actions 日志定位失败步骤（check / lint / format / architecture / content / test / build / site / e2e） | 本地复现修复；lockfile 漂移时重新 `npm ci` 并提交                       |
| 线上 sitemap 404                          | 检查 `apps/general/dist/sitemap-index.xml` 与 `sitemap-0.xml`                                               | 重新构建并确认 `@astrojs/sitemap` 集成仍在                              |
| 直链章节页首屏 THINKING fallback          | DevTools 查看 `<head>` 是否有目标章节 `modulepreload`                                                       | 确认 `LAZY_SECTION_BY_PAGE` 含该章节，构建日志有注入记录                |
| 共享内容未更新                            | 检查 `npm run content:check` 与生成文件 commit                                                              | 运行 `npm run content:align` 后提交并重新部署                           |
| `/admin` 保存后未生效                     | 后台是否提示已推送；GitHub `main` 是否有新 commit                                                           | 等待托管构建完成；确认 PAT 仍有 Contents 读写权限                       |
| 图片 404 / CORS / `SignatureDoesNotMatch` | 见 [`r2-images.md`](./r2-images.md)「故障排查」                                                             | 核对 CDN 缓存、对象 key、CORS 白名单与 `.env` 凭据                      |
| 站点图片回退到 `public/images`            | 构建环境缺 `PUBLIC_IMAGE_BASE_URL`                                                                          | 在托管项目环境变量中设置后重新部署                                      |
| 右缘无切换按钮 / 恒 classic               | `PUBLIC_DESK_URL` 未配置（kill switch 属预期）或构建环境缺变量                                              | 确认托管项目环境变量含桌面地址                                          |
| 切到 Win95 黑屏 / 桌面不响应              | 桌面子域未就绪，或跨源消息被拒                                                                              | 直访 `https://desk.example.com/?shell=full`；核对两站域名与环境变量一致 |
| canonical / sitemap 仍是 example.com      | 构建时未设置 `PUBLIC_SITE_ORIGIN`                                                                           | 设置真实 origin 后重新构建                                              |

## 验证 SOP

在仓库根目录执行：

```sh
# 通用版日常改动
npm run check --workspace @mhk/general
npm test --workspace @mhk/general

# 涉及路由、内容集合、依赖或配置：追加构建
npm run build:general

# 浏览器 QA
npm run dev:general   # http://127.0.0.1:4321
# 或两个应用一起：
npm run dev           # 4321 / 4322

# 已构建的融合服务器上采样；脚本不会自行启动服务
node scripts/fusion-performance.mjs --base-url http://127.0.0.1:4421
# 用生产媒体配置的预览时显式提供两个 origin
node scripts/fusion-performance.mjs --base-url http://127.0.0.1:4521 --desktop-url http://127.0.0.1:4522
```

`tests/fusion/production-readiness.spec.ts` 通过真实网络故障检查阻断、503、
慢文档/脚本/非关键图片、取消后晚加载、隐藏与活动 iframe 重载、阅读位置恢复
以及浏览器存储不可用。`MHK_FUSION_BROWSER=firefox|webkit` 可在同一配置运行
其他浏览器；默认完整门禁仍使用 Chromium。实体手机的 IME、后台策略和
浏览器音频权限需单独验收，桌面 WebKit 通过不代表实体 Safari 已验收。

性能报告写在 ignored 的 `apps/desktop/artifacts/qa/`，区分冷启动、内容就绪与
暖切换，记录接受前的桌面请求数、资源体积和可用的本地绘制指标。Chromium
慢网样本使用明确的网络延迟、吞吐和 CPU 降速；Firefox / WebKit 不宣称使用
同样的 CDP 降速。单次实验不代表线上用户分位数、INP 或 Lighthouse 分数。

构建后核对 `apps/general/dist/` 含 `robots.txt`、`llms.txt`、`rss.xml`、
`atom.xml`、`sitemap-index.xml` / `sitemap-0.xml`；首页与直链章节页 `<head>`
含预期 `modulepreload`。部署后核对：

| 检查项                                         | 期望                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `https://www.example.com/robots.txt`           | 含 `Disallow: /admin`、`Disallow: /article-fragments/` 与 sitemap |
| `https://www.example.com/sitemap-index.xml`    | 可访问，不含 `/admin`、`/article-fragments/`                      |
| `https://www.example.com/llms.txt`             | 仅 listed 文章，链接指向 `.md` 源文件                             |
| `https://www.example.com/rss.xml` / `atom.xml` | 可解析，过滤规则一致                                              |
| `/admin`                                       | 存在且 `meta robots="noindex, nofollow"`                          |
| `/`（桌面宽屏、无偏好）                        | 先显示通用版与 Hero 推荐卡；接受后才进入 Win95 并写入偏好         |
| `/projects` 等深链（无偏好）                   | 保持 classic                                                      |
| 深链（已有 Win95 偏好）                        | 沿用 Win95；深链不再重置模式                                      |
| 手机首次显式进入 Win95                         | 先弹出体验降级提示；确认后本次会话不再提示                        |
| 桌面 origin `/`                                | 可达；`/?shell=full` 可被通用版嵌入                               |
| 页面图片                                       | 指向 `PUBLIC_IMAGE_BASE_URL`，无 404 / CORS 报错                  |
