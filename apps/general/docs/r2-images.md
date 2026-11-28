# 图片对象存储管线

图片托管是可选的：配置后，所有站点图片放在 S3 兼容对象存储（示例为
Cloudflare R2），页面通过 `PUBLIC_IMAGE_BASE_URL` 指向它；未配置时，
`apps/general/public/images/` 作为本地同步源与同源回退。本文说明地址布局、
派生图、同步脚本、后台上传与环境配置。

## 架构

```
                 访客（只读）                                管理员（读写）
                    │                                          │
                    ▼                                          ▼
        PUBLIC_IMAGE_BASE_URL 基座                    S3 endpoint (virtual-hosted)
                    │                                          │
                    ▼                                          ▼
           对象存储 bucket: <bucket>                 对象存储 bucket: <bucket>
            key: images/<folder>/<name>               key: images/<folder>/<name>
                    │                                          │
                    └──────────────┬───────────────────────────┘
                                   │
                                   ▼
                          ┌──────────────────────────────────────────┐
                          │ apps/general/scripts/sync-images.mjs      │  本地全量/增量同步（dry-run 默认）
                          └──────────────────────────────────────────┘
                                   │
                                   ▼
                          ┌──────────────────────────────────────────┐
                          │ /admin GalleryPanel                      │  浏览器 generateImageDerivative → 直传
                          │ profile.json 元数据                      │  元数据仍走 GitHub commit
                          └──────────────────────────────────────────┘
                                   │
                                   ▼
                          ┌──────────────────────────────────────────┐
                          │ src/lib/images/url.ts                    │  resolveImageSrc(src)
                          │ 输出：PUBLIC_IMAGE_BASE_URL/images/...   │
                          └──────────────────────────────────────────┘
                                   │
                                   ▼
                          React 岛渲染图片 URL
```

## 地址与职责

| 地址                                            | 用途                                        | 访问模式                          | 谁能访问                        |
| ----------------------------------------------- | ------------------------------------------- | --------------------------------- | ------------------------------- |
| `https://static.example.com`                    | 站点图片只读加速（`PUBLIC_IMAGE_BASE_URL`） | `GET`                             | 公开访客                        |
| `R2_ENDPOINT`（virtual-hosted S3 endpoint）     | 图片管理                                    | `GET` / `PUT` / `DELETE` / `HEAD` | 管理员（本地脚本 + 后台浏览器） |
| `https://github.com/your-org/your-content-repo` | `profile.json` 元数据、文章内容             | Git Data API                      | 管理员 PAT                      |

> 示例域名与仓库地址都是占位，替换为你自己的。

## public/ 本地保留与 OG 卡片

`apps/general/public/` 下仅 favicon、`bgm.mp3` 等同源资源必须随站点部署；
`apps/general/public/images/` 是原图的本地镜像，已被 `.gitignore` 忽略，
新克隆与 CI 中不存在。若构建时本地镜像存在，Astro 仍会把它复制到
`dist/images/`，但配置 `PUBLIC_IMAGE_BASE_URL` 后页面图片 URL 指向对象存储。

桌面版使用同一套对象 key。`apps/desktop/public/images/` 只跟踪离线渲染
所需的展示 WebP 与 VGA 预览；大型相机原图不入 Git，由
`src/data/media.ts` 经 `PUBLIC_IMAGE_BASE_URL` 解析到 `images/…`。原始尺寸/
格式/字节数保留在 `src/data/media-originals.json`，供 ACDSee 属性和排序离线
使用；`npm run content:align` 只复制/校验本地展示副本，不要求原图存在。
`python apps/desktop/scripts/generate-portfolio-previews.py [--metadata-only]`
会同时写入 `media-files.json`（本地文件）与 `media-originals.json`（仅对象
存储的原图）：它按作者的 `downloadSrc`/`full` 路径检查
`apps/general/public/images/` 本地镜像；镜像缺失时保留已跟踪的原图元数据并
明确提示跳过，不会清空。

| 文件              | 保留同源的原因                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `favicon.webp`    | WebP favicon，`BaseHead.astro` 以 `image/webp` 声明                                                |
| `favicon-180.png` | Apple Touch Icon；iOS 主屏图标使用 PNG 以保证兼容性                                                |
| `bgm.mp3`         | 背景音乐经 Web Audio `MediaElementSource` 接入 FFT 分析器；跨域 CDN 不返回 CORS 头会导致音频被静音 |

OG 分享卡片托管在 `images/og/`（全站默认 `default.webp`，文章可配专用卡）。
引用处统一写站内路径 `/images/og/...`——`BaseHead.astro` 的默认 `image`、
`useDocumentHead.ts` 的兜底、文章 frontmatter `heroImage`——渲染时经
`resolveImageSrc` 拼到对象存储基座。OG 图为成品图，不经过 `images:optimize`
派生流程。

## 对象存储侧设置清单

1. **Bucket**：任意名称，本文用 `<bucket>` 表示。
2. **公开访问**：允许公开读取，访客通过 `PUBLIC_IMAGE_BASE_URL/images/...`
   直接取图；或用 CDN 前置并只让 CDN 回源。
3. **自定义域 / CDN**：把只读域名绑定到 bucket，作为 `PUBLIC_IMAGE_BASE_URL`。
4. **CORS**：必须允许浏览器在站点 origin 与 `http://localhost:4321` 发起
   `PUT` / `DELETE`，否则后台直传会报 CORS 错误。

### CORS 配置 JSON 示例

```json
[
  {
    "AllowedOrigins": ["https://www.example.com", "http://localhost:4321"],
    "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## 环境变量

| 变量                    | 说明                                                                                                         | 使用位置                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `PUBLIC_IMAGE_BASE_URL` | 访客只读地址，如 `https://static.example.com`。未配置时 `src/lib/images/url.ts` 回退为同域 `public/images`。 | 渲染层                                             |
| `R2_ENDPOINT`           | S3 virtual-hosted endpoint，含 bucket 名。                                                                   | `apps/general/scripts/sync-images.mjs`、后台浏览器 |
| `R2_ACCESS_KEY_ID`      | 对象存储访问密钥 id。                                                                                        | `apps/general/scripts/sync-images.mjs`、后台浏览器 |
| `R2_SECRET_ACCESS_KEY`  | 对象存储访问密钥 secret。                                                                                    | `apps/general/scripts/sync-images.mjs`、后台浏览器 |

> 凭据三字段在后台由用户输入后存入
> `localStorage['mirahikari-portfolio:admin:cred:r2']`，与 GitHub PAT 同级
> 管理，不入仓库。该 key 是兼容既有浏览器数据的历史标识。

## 本地工作流

新增或修改本地原图后：

```bash
# 1. 生成 display WebP（幂等）
#    gallery/honors/blog: <stem>-display.webp（1920 长边），blog 支持按文章分子目录递归
#    projects: 主图本身作为展示图，不生成额外派生图
#    输入支持 jpg/jpeg/png/webp，已生成的 *-display.webp 会被跳过。
npm run images:optimize --workspace @mhk/general

# 2. 预览将要上传/删除的内容（dry-run 默认，不会真的写对象存储）
npm run images:sync --workspace @mhk/general

# 3. 确认无误后执行上传
npm run images:sync --workspace @mhk/general -- --apply

# 4. 如需删除远端已不存在于本地的 key，加 --delete
npm run images:sync --workspace @mhk/general -- --apply --delete

# 5. 仅清理远端遗留的缩略图对象
npm run images:sync --workspace @mhk/general -- --apply --delete-thumbnails

# 6. 强制覆盖已有对象（一般不推荐）
npm run images:sync --workspace @mhk/general -- --apply --force
```

脚本通过 `aws4fetch` 对 S3 endpoint 签名，按 `images/<folder>/<name>` 的 key
布局同步。

## 派生图命名与两条产线的一致性

对象存储中所有图片 key 都按 `images/<folder>/<name>` 布局。展示图采用统一
的派生约定：

| 目录                 | 展示图                             | 原图     | 说明                                                      |
| -------------------- | ---------------------------------- | -------- | --------------------------------------------------------- |
| `gallery` / `honors` | `<stem>-display.webp`（长边 1920） | 保留     | 本地与后台产物一致                                        |
| `blog/<slug>/`       | `<stem>-display.webp`（长边 1920） | 保留     | 博文照片按文章分子目录，递归生成                          |
| `projects`（本地）   | `<stem>.<ext>`（原图本身）         | 同展示图 | 主图保持现有展示图                                        |
| `projects`（后台）   | `<stem>.webp`（display 尺寸派生）  | 不保留   | `generateImageDerivative` 的 display 派生直接作为主图上传 |

本地 `npm run images:optimize --workspace @mhk/general` 与后台 GalleryPanel
上传遵循同一套 key 布局：gallery / honors 都产出原图与 `-display.webp`；
projects 只产出主图。后台上传时由浏览器调用 `generateImageDerivative` 生成
display WebP，projects 的 display 直接作为 `<stem>.webp` 主图写入。

长边与质量来自 `packages/site-core/src/media/derivatives.ts`，canonical 路径
规则来自 `media/image-path.ts`。上传后持久化 `/images/...`，CDN URL 由渲染
适配器生成。桌面 ACDSee 的像素调整与导出使用同源 `/images/` 展示副本或
访客文件；原始相机图片由对象存储下载入口提供，不依赖原图允许 Canvas 跨源
读取。

## 后台工作流

`/admin` 的 Gallery / Honors / Projects 图片上传是浏览器端直传
（`@/admin/r2/client` 的 key 白名单仅放行 `images/gallery|honors|projects/`
三前缀；Profile 头像只是 `profile.json` 中的路径字符串字段，不走直传）：

1. 用户在 `/admin` 输入存储凭据，保存在
   `localStorage['mirahikari-portfolio:admin:cred:r2']`。
2. 选择图片后调用 `@/admin/image/derivatives.ts` 的
   `generateImageDerivative`，在浏览器内生成一张 `display`（1920px 长边）
   WebP；各目录写入的 key 布局与上一节一致。
3. 浏览器使用 AWS Signature V4 直接向 `R2_ENDPOINT` 发起 `PUT`，key 为
   `images/<folder>/<name>`。新对象附带 `If-None-Match: *`，同名并发上传由
   存储服务原子拒绝；失败补偿只删除本批已新建的对象。Bucket CORS 的
   AllowedHeaders 必须允许此请求头。条件写入语义见
   [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/)。
4. 图片元数据（路径、宽高、日期等）随 `profile.json` 或 frontmatter 一起，
   通过 Git Data API 提交到 GitHub，由你的托管平台按配置触发构建。

### 博客正文插图

博客正文照片统一使用 `src/components/blog/PhotoFigure.astro`（单张）与
`PhotoSet.astro`（成组 contact-sheet），MDX 内直接 import 使用。组件在构建期
经 `resolveImageSrc` 解析地址：配置了 `PUBLIC_IMAGE_BASE_URL` 时输出完整
URL，本地未配置时回退同域 `public/images/`，开发无需联网。

- 图片放在 `apps/general/public/images/blog/<文章 slug>/` 子目录
  （`apps/general/scripts/optimize-images.mjs` 与 `sync-images.mjs` 均支持
  递归），运行 `npm run images:optimize --workspace @mhk/general` 生成
  `-display.webp` 后 `npm run images:sync --workspace @mhk/general -- --apply`
  上传。
- `PhotoFigure` 的 `src` 传 display 图、`full` 传相机原图（灯箱 FULL RES
  下载）、`date` 传拍摄时间标签（灯箱底栏显示）、`width/height` 传 display
  图尺寸（防 CLS）；图注写在 `caption`（缺省复用 `alt`）。
- 客户端由 `enhanceArticleImages` 把这些数据提升为灯箱条目
  （figcaption → 标题、`data-full` → 下载、`data-date` → 时间）。
- 已在 Gallery 里的同一张照片直接复用 `/images/gallery/` 路径，不重复上传；
  徒手写 `![...](...)` 的旧式插图仍需引用完整 URL（不经
  `resolveImageSrc`）。

### 友链 favicon

friends 章节的 favicon 走一次性本地作业流（不新增长期爬虫）：从各站解析最优
图标（优先级 `apple-touch-icon` → 较大 PNG/SVG → `favicon.ico`），下载到
`apps/general/public/images/friends/<slug>.webp`（约 128px WebP），同步后在
`packages/site-core/content/profile.json` 的 `friendLinks[].favicon` 写
`/images/friends/<slug>.webp`（渲染时经 `resolveImageSrc` 解析；本地
`public/images/` 仍仅作同步源，未纳入 Git）。

```bash
npm run images:sync --workspace @mhk/general            # dry-run 预览
npm run images:sync --workspace @mhk/general -- --apply  # 上传
```

留空 `favicon` 的友链在前台回退为对方站点 `<origin>/favicon.ico` 约定路径，
加载失败再降级为名称首字符字母块。

## 迁移步骤

若从零开始将图片迁入对象存储，建议按以下顺序操作：

1. **准备本地镜像** `apps/general/public/images/`（该目录被 `.gitignore`
   忽略，新克隆中不存在，需要从对象存储或原始素材恢复），运行
   `npm run images:optimize --workspace @mhk/general` 生成 display。
2. **推送到对象存储**：
   ```bash
   npm run images:sync --workspace @mhk/general -- --apply
   ```
3. **配置 `PUBLIC_IMAGE_BASE_URL`** 为只读域名，重新部署站点。
4. **验证**：访问线上页面，确认图片地址已指向该基座，且无 404 / CORS 错误。
5. **保持本地目录不入库**：`apps/general/public/images/` 已被 `.gitignore`
   忽略。如未来误加入索引，可用
   `git rm -r --cached apps/general/public/images` 移除跟踪；历史大文件清理
   使用 `git filter-repo` 等工具，并谨慎处理提交历史。

## 加载与预加载策略

图片加载分层，越往下越「提前」：

| 层级     | 机制                                                                                 | 位置                                       |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| CDN 预热 | 配置 `PUBLIC_IMAGE_BASE_URL` 时，`BaseHead.astro` 输出 `preconnect` + `dns-prefetch` | `src/components/seo/BaseHead.astro`        |
| 组件渲染 | 统一使用 `SiteImage`，自动接入 shimmer、error 回退与 `decoding="async"`              | `src/components/ui/SiteImage.tsx`          |
| 视口加载 | 非首屏图 `loading="lazy"`，当前焦点图 `eager` / `fetchPriority="high"`               | 各列表组件、`Lightbox`                     |
| 悬停预取 | 卡片 `pointerenter` / `focus` 时 `prefetchImage` 预取灯箱大图                        | `GallerySection`、`HonorLightCards`        |
| 邻图预载 | 灯箱打开后由 YARL `carousel.preload` 预挂相邻 slide（省流模式降为 0）                | `src/components/effects/lightbox/root.tsx` |
| 空闲预取 | `prefetchImagesOnIdle` 批量预取当前筛选下的展示图                                    | `GallerySection`                           |

渲染层统一使用 `src/components/ui/SiteImage.tsx` 展示图片，禁止在手写
`<img>` 中重复实现 shimmer 骨架、error 回退或 `decoding="async"`；SiteImage
消费方包括 Gallery、Projects（Featured/Grid/Queue）、About 头像与
HonorLightCards，并支持可选的 `layoutId` 共享布局动画。Lightbox 的下载操作
使用 `src/lib/images/download.ts` 的 `downloadImage`（优先 fetch→blob，跨域
CORS 失败时回退到新标签页）；相邻图预取与列表空闲预取仍由
`src/lib/images/prefetch.ts` 负责，它提供全局去重、SSR 空操作、省流 / 2G
弱网时自动关闭预取，以及可配置的并发上限（默认 3 张）。

## 故障排查

| 现象                                                                      | 原因                                               | 处理                                                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 上传后图片返回 404                                                        | CDN / 对象存储缓存延迟                             | 等待 1–2 分钟后刷新；如仍异常，检查 key 是否与本地一致。                                                                             |
| 浏览器控制台报 CORS 错误                                                  | CORS 未允许当前 origin 或对应方法                  | 在 bucket 设置中确认 AllowedOrigins 包含站点 origin 与 `http://localhost:4321`，AllowedMethods 包含 `PUT`、`DELETE`、`GET`、`HEAD`。 |
| `npm run images:sync --workspace @mhk/general` 报 `SignatureDoesNotMatch` | Access Key / Secret Key 错误，或 endpoint 拼写有误 | 检查 `.env` 中的 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_ENDPOINT`；确认 secret 无多余空格或换行。                           |
| 站点图片仍走 `public/images`                                              | `PUBLIC_IMAGE_BASE_URL` 未设置                     | 在 `.env` 或构建环境中设置 `PUBLIC_IMAGE_BASE_URL`。                                                                                 |
