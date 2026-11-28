# /admin 内容管理后台操作手册

本文档面向使用 `/admin` 维护站点内容的管理员，说明如何配置凭据、登录、
操作各面板，以及保存后的生效链路。后台的**内部结构**（文件地图、提交与
冲突重试机制）见 [`architecture.md`](./architecture.md)「管理后台」章节；
图片规格与同步流程见 [`r2-images.md`](./r2-images.md)。

## 概览

`/admin` 是 client-only 的 React 管理后台，在浏览器中直接读写一个 GitHub
仓库（下文用 `your-org/your-content-repo` 表示）。默认写入 `main` 分支。
可管理：

| 面板 | 编辑内容                                  | 落盘位置                                                    |
| ---- | ----------------------------------------- | ----------------------------------------------------------- |
| 博客 | 文章列表、frontmatter 与 Markdown 正文    | `packages/site-core/content/blog/**/*.{md,mdx}`             |
| 项目 | 项目卡片列表、frontmatter 与正文          | `packages/site-core/content/projects/*.md`                  |
| 资料 | 个人文案各节（头像、技能、荣誉、友链等）  | `packages/site-core/content/profile.json`                   |
| 图库 | 图片上传（对象存储直传）与 `galleryItems` | 对象存储 bucket + `packages/site-core/content/profile.json` |
| 提交 | 最近提交历史（只读）                      | GitHub `main` 分支                                          |

任何保存动作都会向 `main` 分支推送 commit。之后由你的托管平台按常规流程
重新构建；如果托管平台监听了该分支，通常一两分钟后线上生效。后台成功提示会
说明「已推送」，部署时间取决于你的托管配置。

> 换用你自己的仓库时，把后台读取的 owner/repo 配置改成本仓库的地址；本文
> 中的 `your-org/your-content-repo` 都是占位。

## 首次配置：凭据

登录页（`src/admin/ui/LoginGate.tsx`）需要两类凭据：GitHub PAT（必填）与
对象存储凭据（选填，仅图片上传需要）。两者均只在当前浏览器 localStorage 中
保存，不会上传到除 `api.github.com` 与对象存储 endpoint 之外的任何服务。

### GitHub fine-grained PAT（必填）

- **作用**：通过 Git Data API 读写仓库内容（getRef → blob/tree/commit →
  updateRef，见 `src/admin/github/store.ts`）。
- **权限要求**：fine-grained token，**仅授权目标内容仓库**，勾选
  **Contents: Read and write**（无需其他权限）。
- **创建入口**：GitHub Settings → Developer settings → Personal access
  tokens → Fine-grained tokens → Generate new token，或直接访问
  <https://github.com/settings/personal-access-tokens/new>。
- **校验方式**：登录时调用 `GET /user` 验证 token 有效性。

### 对象存储 API Token（选填）

- **作用**：图片二进制经浏览器直传 S3 兼容对象存储（`src/admin/r2/client.ts`）。
  示例服务为 Cloudflare R2，任何 S3 兼容存储都可以。
- **权限要求**：登录校验会发起一次 ListObjectsV2（读取列表）；上传走 PUT、
  失败回滚走 DELETE。Token 需具备目标 bucket 的**对象读取（List/Get）、
  写入（Put）与删除（Delete）**权限。
- **Endpoint 格式**：virtual-hosted 风格，形如
  `https://<bucket>.<account-id>.r2.cloudflarestorage.com`（bucket 内嵌在
  endpoint 中，不含端口/路径/查询串）。
- **不配置的影响**：可正常登录并编辑博客/项目/资料，但图库面板无法上传
  图片（显示未配置存储凭据的提示）。

## 登录与凭据存储

- 未存储 token 时显示 `LoginGate`；对象存储三项（endpoint / accessKeyId /
  secretAccessKey）需同时填写，只填部分会报错。
- 所有已配置的服务**验证通过后**才写入 localStorage；任一项失败则整体不保存。
- 右上角「退出登录」同时清除 GitHub PAT 与对象存储凭据。

localStorage key（定义于 `src/lib/storage/keys.ts`）：

| Key                                                   | 内容                                             |
| ----------------------------------------------------- | ------------------------------------------------ |
| `mirahikari-portfolio:admin:cred:gh-pat`              | GitHub fine-grained PAT 原文                     |
| `mirahikari-portfolio:admin:cred:r2`                  | JSON：`{endpoint, accessKeyId, secretAccessKey}` |
| `mirahikari-portfolio:admin:ui:pending-project-image` | 最近上传的项目主图路径（供新建项目预填）         |

> 这些 key 是历史遗留的存储标识，为兼容已保存的浏览器数据而保留；改名会
> 让现有用户的凭据失效。

> **安全提醒**：凭据以明文存于浏览器 localStorage，任何能访问该浏览器配置
> 的人都能读取并使用（PAT 可改写仓库内容）。**不要在公共/共享机器上登录
> 后台保存凭据**；用完建议退出登录，或定期轮换 PAT 与存储 Token。

## 面板操作手册

通用行为（博客/项目面板相同）：

- **保存**：校验 frontmatter（`src/admin/schema/` 的 `validateSchemaValue`）→
  序列化为 Markdown（`src/admin/content/frontmatter.ts`）→ 提交 commit →
  回到列表并刷新。
- **删除**：弹确认框，提示不可撤销；commit message 为
  `content(blog): remove <id>` / `content(projects): remove <id>`。
- 保存/删除成功后显示绿色横幅（部署提示 + 「查看 commit」链接）；401/403
  错误会提示「Token 可能已失效，请到右上角退出后重新登录」。

### 博客面板

- 列表支持按标题、ID、标签搜索，按 `publishDate` 倒序；行内显示草稿/精选徽标。
- **新建文章**：填标题与 slug（slug 可留空，自动按标题生成）；格式可选
  `.md` / `.mdx`；新文章默认 `draft: true`、日期为今天。
- **编辑**：frontmatter 表单（标题、摘要、发布日期、更新日期、标签、分类、
  封面图、草稿、列表显示、精选、评论开关、作者、AI 创作标识/模型、相关文章、
  版本、更新记录）+ 正文 Markdown 编辑区（实时字数统计）。
- 保存 commit message：`content(blog): add|update <id>`。

### 项目面板

- 与博客同构，列表按 `date` 倒序；行内显示隐藏/精选徽标（`active: false`
  显示「隐藏」）。
- `date` 字段格式：`YYYY` 或 `YYYY-MM-DD`。
- **封面图**：`image` 字段为路径字符串，表单提示「图片需先通过图库面板上传
  到 projects 目录」——上传后主图链接会写入
  `mirahikari-portfolio:admin:ui:pending-project-image`，**新建项目时自动
  预填** `image` 字段（一次性消费，见 `src/admin/ui/panels/ProjectsPanel.tsx`）。

### 资料面板

- 按节编辑 `profile.json`；左侧（移动端为顶部 chip 条）列出各节：生日、技能
  引言、个人资料、备案信息、当前动态、历程、原则、教育经历、工作经历、证书、
  语言、技能分类、技能、正在学习、荣誉奖项、友情链接（图库节由图库面板专门
  管理，此处不出现）。
- 每节独立保存（commit message：`content(profile): update <节名>`）；有未保存
  修改时切换节会弹确认。
- 保存携带加载时的 `headSha`，若期间仓库被其他提交改动则报「内容已被其他
  提交修改，请刷新后重试」。
- **头像**：`profile.avatar` 只是路径字符串字段（如 `/images/...`），**不走
  对象存储直传**——更换头像需先在图库面板上传到对应目录，再把路径填回这里。

### 图库面板

- **上传区**：选择目标文件夹（图库 `gallery` / 荣誉 `honors` / 项目
  `projects`）→ 选择图片 → 上传。仅支持 JPG、PNG、WebP，且文件不超过 50MB。
- 上传流程（详见「图片上传流程」一节）：
  - `gallery` / `honors`：上传原图 + `-display.webp` 派生图，随后自动进入
    「新建条目」编辑态，预填标题/地点/日期/排序/路径/宽高等字段，填写后点
    「保存条目」（commit 到 `profile.json` 的 `galleryItems`）。
  - `projects`：只上传派生展示图，显示主图链接（可复制），并写入
    `mirahikari-portfolio:admin:ui:pending-project-image` 供新建项目预填；
    **不自动创建条目**。
- **条目列表**：点击行进入编辑，右侧「删除」只把条目从 `galleryItems` 列表
  移除，**图片文件本身不受影响**（确认框原文：「此操作只从 galleryItems
  列表中移除该条目，图片文件仍保留在仓库中」；如需清理文件请另行处理对象
  存储中的对象）。

### 提交面板

- 只读展示最近 15 条 `main` 分支提交：commit message、短 SHA、相对时间，
  可跳转 GitHub 查看详情；顶部提示每次保存都会触发托管重新构建（具体时间
  取决于你的托管配置）。

## 保存链路与生效时间

1. **GitHub commit**（`src/admin/github/store.ts`）：新建 blob → 基于 `main`
   当前 tree 建新 tree → 建 commit → `PATCH refs/heads/main`（非 force）。
   可写路径仅限 `packages/site-core/content/blog/`、
   `packages/site-core/content/projects/`、
   `packages/site-core/content/profile.json`、
   `apps/general/public/images/`，其余路径一律拒绝。生成投影（如
   `projects.generated.json`）不在白名单内，共享内容变更后需在仓库根目录
   运行 `npm run content:align`。
2. **托管构建**：若托管平台监听 `main`，新 commit 会触发重新构建部署；
   时间取决于平台配置。
3. **验证**：保存成功后绿色横幅提供「查看 commit」链接；可刷新站点对应
   页面核对（`npm run dev:general` 是本地 QA，与线上部署无关）。

图片上传则**先直传对象存储**（CDN 缓存数秒生效），再通过 commit 保存
元数据——因此图片「已在对象存储」与「线上页面可见」可能相差一两分钟。

## 冲突与错误处理

| 场景                                        | 后台行为                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ref 被其他提交移动（422 fast-forward 冲突） | `commitWithRetry` 自动重试，最多 3 次（`MAX_RETRIES`），仍失败则报「提交冲突，请刷新后重试」                              |
| 资料面板保存时仓库已变化（409）             | 「内容已被其他提交修改，请刷新后重试」，刷新后重存                                                                        |
| 401                                         | 「PAT 无效或已过期，请重新登录」；面板会附加提示退出重登                                                                  |
| 403                                         | 「权限不足，请检查 PAT 是否具有 contents 读写权限」                                                                       |
| 422 参数错误 / 5xx                          | 显示 GitHub 返回的字段级错误摘要 / 「GitHub 服务暂时不可用，请稍后重试」                                                  |
| 网络失败                                    | 面板显示错误横幅，内容未提交，可重试                                                                                      |
| 存储上传失败                                | 已上传的新对象会被自动回滚删除（`putObjectsWithRollback`），避免残留孤儿文件；超时 5 分钟报上传超时，请确认对象状态后重试 |

常见原因：PAT 过期/被吊销、PAT 未勾选 Contents 读写、存储 Token 权限不足或
endpoint 格式错误（必须是 `https://<bucket>.<account-id>.r2.cloudflarestorage.com`
或你的 S3 兼容服务的等价地址）。

## 图片上传流程

集合与 profile 读取先取得 commit SHA，再按该 SHA 获取完整快照。
Blog、Projects、Gallery 和 Profile 保存或删除都传入 `expectedHeadSha`；版本
变化返回 409，保留当前编辑内容并要求重新加载。损坏的本地存储 endpoint 会被
清除并回到登录配置，后台渲染异常由页面错误边界提供重新加载入口。

提交、删除或上传进行时，表单与相关导航/退出登录暂时禁用，防止已提交的快照
和后续输入交错。请求失败后重新启用操作并保留当前草稿。新建内容的 slug 在
手动修改后不再跟随标题变化。
对象存储新对象使用 `If-None-Match: *`；并发图片名冲突不会覆盖已有对象或
回滚删除另一批上传。

浏览器端直传（`src/admin/r2/client.ts` + `src/admin/image/derivatives.ts`）：

1. **校验**：文件类型（JPG/PNG/WebP）与大小（≤ 50MB）。
2. **派生**：Canvas 生成 display 图——长边 1920px、contain 等比缩放（原图更小
   则不放大）、WebP 0.8（浏览器不支持 WebP 时整体回退 JPEG 0.85）。
3. **命名**：文件名转 slug 作 stem；与已有对象冲突时自动追加 `-2`、`-3`…
   （`allocateStem`）。
4. **写入**：
   - `gallery` / `honors`：`images/<folder>/<stem>.<原扩展名>`（原图）+
     `images/<folder>/<stem>-display.webp`（派生图）；
   - `projects`：仅 `images/projects/<stem>.<webp|jpg>`（展示图即主图）。
5. **请求细节**：PUT + `Cache-Control: public, max-age=2592000`（30 天）；
   PUT 超时 5 分钟、DELETE 30 秒、List 15 秒。
6. **key 白名单**：任何写入/删除/列举必须落在
   `images/(gallery|honors|projects)/` 前缀内，越界直接拒绝
   （`assertSafeKey` / `assertSafePrefix`）。

## 安全与隔离

- **SEO 三重隔离**：`src/pages/admin.astro` 输出 `noindex, nofollow` meta；
  `src/pages/robots.txt.ts` 声明 `Disallow: /admin`（另有
  `/article-fragments/`）；`astro.config.ts` 的 sitemap `filter` 排除
  `/admin` 与 `/article-fragments/`。
- **凭据风险**：PAT 与存储密钥明文存 localStorage（见上文「安全提醒」）；
  后台无服务端会话，所有请求由浏览器直接携带凭据发出。
- **浏览器环境要求**：需现代浏览器支持 `fetch`、`createImageBitmap`、
  Canvas `toBlob`、`crypto`（AWS 签名）与 localStorage；生产环境建议使用
  本人常用浏览器登录。

## 常见问题排查表

| 现象                                 | 排查方向                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| 登录报「PAT 无效或已过期」           | 重新生成 PAT 并确认授权仓库与 Contents: Read and write 权限                   |
| 图库上传按钮置灰                     | 登录时未填存储凭据——退出登录重新填写 endpoint / accessKeyId / secretAccessKey |
| 上传报「仅支持 JPG、PNG、WebP…50MB」 | 更换格式或压缩后重试                                                          |
| 保存报「提交冲突，请刷新后重试」     | 多人/多标签页同时编辑导致，刷新列表后重做修改                                 |
| 保存报 409「内容已被其他提交修改」   | 各内容面板的并发保护，重新加载后重做修改                                      |
| 线上看不到刚保存的内容               | 确认 commit 已推送、托管已重新构建；检查「查看 commit」链接                   |
| 图片上传成功但页面显示旧图           | CDN 缓存数秒生效；若仍旧，检查 `imageSrc` 路径是否指向 `-display` 派生图      |
| 后台页面被搜索引擎收录               | 不应发生——已三重隔离；如出现检查 `noindex` meta 与 `robots.txt` 是否生效      |
