# Architecture — 站点架构与扩展点

本文是仓库的架构知识入口，描述渲染模型、状态边界、翻页导航、各个「只改一处」的扩展点，以及动效与部署约定。文档职责见 [文档中心](./README.md)，动效叙事细节见 [motion-language.md](./motion-language.md)。

## 渲染模型

共享纯事实集中在 `packages/site-core/src`：`fusion` 提供信封、事件、目标与阅读模型；
`content-model` 定义文章、项目和个人记录；`media` 定义 canonical 图片路径与派生规格；
`config/giscus.ts` 与 `kounter/kounter-model.ts` 提供两站公共配置。应用保留各自 DOM、Canvas、CDN 和存储适配器。

阅读偏好默认 `comfortable`，由共享阅读笔记本统一保存（通用版与桌面版同源）。
笔记 `offset` 为全文 UTF-16 偏移，通用站创建块锚点并按 note id 增删。
无法渲染的笔记仍保留；容量达到 128 后拒绝新增。进度、偏好与笔记分别订阅，
保存进度不会重建高亮或恢复滚动。全文滚动仅在首次挂载或显式返回阅读目标时恢复。

Fusion 目标使用原始项目 id、技能名称和 canonical 图片路径；命令 id 继续保留自己的稳定前缀。
冷启动与 history 均消费 `?item=`。桌面图片目标进入 ACDSee，friends 进入 Profile 的 Contact。
博客 SSR 与 SPA 使用同一 head 描述符，目录 canonical 有尾斜杠；完整 head 相同才保留已有节点。

这是一个 **Astro SSG 站点 + 单个 React SPA 岛**。`src/pages/index.astro` 在构建期取内容集合数据并挂载 `<App client:load>`；`src/pages/[section].astro` 与 `src/pages/blog/[...slug].astro` 为每个 URL 生成静态页，同样挂载 `App` 并传入正确的 `initialSection` / `initialArticle`，保证直链落在正确分区。

`src/layouts/Layout.astro` 渲染 `<html>` 外壳、classic boot-loader（`#boot-loader`）和全局 `<Cursor>` 岛。classic BootLoader 同时参考最短展示与真实就绪信号 `portfolio:boot-ready`；内联脚本独立兜底，保证遮罩不会常驻；异常路径强制移除遮罩并清除 `aria-busy`。404 等轻量页经 `Layout` 的 `minimalBoot` prop 走简化版，不播完整仪式、不读写 sessionStorage 首访标记。具体时序见[动效语言](./motion-language.md)。

classic 轨在右下角显示当前章节（如 `BLOG / 博客`），百分比、管道与进度轨使用该章节的 `--section-accent-soft`。直达已选择的 Win95 时，启动遮罩改为阻止 classic 闪现的静态底：不显示模拟进度，不要求最短展示；慢连接由 React 的 `PresentationHandoff` 在静态底上提供取消操作。主动从已打开的 classic 进入没有全屏遮罩。

classic 由 App 等待实际 `initialSection` 的 chunk 后请求派发 `boot-ready`，即使没有配置桌面地址也一样。Win95 在受信 `startup`（真实 POST/splash 开始）或可用目的地提交后请求派发；取消和失败也释放初始静态底。协调器在每次挂载最多派发一次。`startup` 只承诺启动画面已可显示；`ready` 才交接目的地焦点。选择跳过开机或复用已有连接时，已确认的目的地直接提交为 `ready`。

## 翻页导航

`App.tsx` 是根组件，全部导航状态委托给 `useFullpageNavigation`（`src/hooks/useFullpageNavigation.ts`），它负责：

- 分区索引、过渡阶段（`idle` | `exit` | `bridge` | `enter`）、方向、背景色
- 博客分区的文章打开/关闭状态
- 通过 `window.history.pushState` 同步历史记录
- 输入处理（滚轮、键盘、触摸），由 `src/hooks/fullpage/` 下的子 hook 承担

项目与技能的命令历史 ID 保持 `project-*` / `skill-*`；命令目标与 fusion
destination 使用作者原始项目 ID、技能名称与 Gallery `imageSrc`。`App` 在挂载
时读取深链，`useFullpageHistory` 在 `popstate` 时恢复 `?item=` 和目标 hash；
初始 history 标记保留 search string。未知文章目标返回 `/blog/` 列表并替换 URL。
Gallery 目标会切到对应分类并滚动定位；friends 在桌面对应 Profile 的 Contact 标签。

分区过渡是一段编排好的异步序列：水印逐字擦除 ∥ 内容散焦退场 → 换色桥接（空光标停顿）→ 内容聚焦入场 → 水印逐字打入。乐谱在 `transitionScore` + `typewriterScore`（`src/lib/motion.ts`）；步进由 `src/lib/typewriter.ts` 播放，`WatermarkLayer` 按 `transitionPhase` 选择 erase/type，`runTransition` 用 `typewriterPhaseDelays` 对齐等待。`lockedRef` 闸门防止过渡重叠，并排队一次待处理导航。

### 键盘与交互快捷键

全站键盘监听分散在输入层各处，下表为完整清单（行为以当前工作树代码为准）：

| 键                                | 场景                                             | 行为                                                                      |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `↑` / `PageUp`                    | 非输入态 · 全站                                  | 上一章节（`useFullpageInputHandlers`）                                    |
| `↓` / `PageDown` / `Space`        | 非输入态 · 全站                                  | 下一章节                                                                  |
| `Home` / `End`                    | 非输入态 · 全站                                  | 跳转首章 / 末章                                                           |
| `Esc`                             | 文章阅读模式                                     | 返回文章列表（阅读模式保持原生滚动，边界键不逐出读者）                    |
| `⌘K` / `Ctrl+K`                   | 全站                                             | 打开 / 关闭命令面板（`App.tsx`）                                          |
| `↑` / `↓`                         | 命令面板                                         | 移动选中项（列表内循环）                                                  |
| `Enter`                           | 命令面板                                         | 执行选中命令（统一 `execute()` stale guard）                              |
| `Esc`                             | 命令面板                                         | 关闭（`useFocusTrap` onEscape + 面板自身监听双保险）                      |
| `Tab` / `Shift+Tab`               | 命令面板 / 移动导航抽屉 / 移动 TOC / 后台 dialog | 焦点在容器内循环（`useFocusTrap`），关闭时焦点还原到打开前元素            |
| `←` / `→`                         | 灯箱                                             | 上一张 / 下一张（YARL 核心默认）                                          |
| `Home` / `End`                    | 灯箱                                             | 首张 / 末张（YARL 未内建，`Lightbox.tsx` 经 controller ref 补齐）         |
| `Esc`                             | 灯箱                                             | 关闭（YARL 核心默认）                                                     |
| `Esc`                             | AI 分享菜单 / 行宽菜单 / 脚注浮层                | 关闭对应弹层（`AIShareMenu`、`ReadingPrefsControls`、`enhanceFootnotes`） |
| `Esc`                             | 灵光模式开启时                                   | 退出灵光模式（焦点不在输入框 / 弹层内时，`App.tsx`）                      |
| Konami 序列 `↑ ↑ ↓ ↓ ← → ← → B A` | 全站（非输入态）                                 | 切换灵光模式（`useKonami`，按键间隔 ≤ 1.5s，大小写不敏感）                |

守卫规则：

- 翻页键在焦点位于 `a / button / input / textarea / select / summary / [contenteditable] / [role]` 等可交互元素上、或按下 Ctrl / Alt / Meta 组合键时不劫持（浏览器与系统快捷键优先）；滚轮同理豁免 Ctrl / Meta（浏览器缩放）。
- 灯箱 / 命令面板 / 抽屉打开期间经 `acquireInputPause` 暂停全页翻页接管，由打开方持有 token（`lightbox` / `command-palette` / `navigation` / `mobile-toc`）。
- 首访提示：`ShortcutHint` 是细指针首访的顶部图例（`↑` / `↓` 翻页、`⌘K` 命令），放在作者标识与导航药丸之间的空轨，不覆盖名字、作品卡或页脚；触屏访客不显示，滑动手势与可见的搜索图标已经传达同样的信息。localStorage 标记已见，不再重复。

## Section 注册表（扩展点）

`src/components/sectionsRegistry.tsx` 集中所有分区组件。非博客交互分区用 `React.lazy` + `Suspense` 懒加载；`BlogSection` 与 `ArticleView` 立即导入，使列表与文章 HTML 被服务端渲染以利 SEO。Suspense fallback（`SectionFallback`）是透明背景 + 居中 THINKING 细字——明暗底色块在懒加载完成瞬间会「闪一下」，故去掉底色、由下方章节画布承接。注册表另导出 `preloadSectionChunk(id)`，App 在导航瞄准目标章节时预热其 chunk，快速跨节跳转不再在 bridge 阶段撞上 fallback。

分区在 `src/lib/sections.ts` 中以带类型的 `const` 数组定义。每个分区含 `id`、双语 label、URL `path`、`watermark` 文本、`bg` 颜色、`isDark` 标志，以及主题字段：`accent`、`accentSoft`、`veilTint`、`mesh`（环境渐变斑块）。新增分区需要两步：在此文件定义分区，并在 `src/components/sectionsRegistry.tsx` 增加 lazy loader 与 `sectionComponents` 映射，其余部分均由配置推导。

`App.tsx` 通过 `useSectionAccent` 发布 `--section-accent` / `--section-accent-soft` 及派生 `--section-accent-ink` / `--section-accent-on`（`src/lib/accent.ts` 的 `deriveAccent` 计算，`tokens.css` 提供水合前的品牌蓝回退）。消费方：左侧章节栏（`src/components/rail/`）、进度/圆点/水印（`FullpageChrome`）、光标、选区、滚动条。背景堆栈：常驻 `DarkVeil`（OKLab tint 渐变）→ 颜色盖层。章节切换为「散焦 · 聚焦」容器级过渡（`SectionViewport` 统一 blur/位移，无横扫色带）；同氛围换色走盖层 CSS tween，跨明暗走 opacity 叠层（outgoing 淡出 + accent 中转脉冲）+ veil morph + accent 补间，详见 [`motion-language.md`](./motion-language.md)。

## Section 状态边界

`SectionViewport` 负责提供章节树所需的状态，但不再把全部 App 数据塞入一个 Context：

- `SectionAppContext.tsx` 内部分为 `useSectionNavigation()`、`useSectionProjects()`、`useSectionCommandTarget()` 三个窄订阅；背景音乐变化不会让项目或命令目标消费者重渲染。
- `BlogSectionContext.tsx` 只服务 `BlogSection`、`ArticleView` 与 `BlogSectionRouter`，承载文章列表、阅读模式、标签、SSR 文章正文和移动 TOC 状态。
- `SectionReadyContext.tsx` 在每个 `SectionScrollHost` 内发布 `isActive && contentReady`；需要入场状态的叶组件直接调用 `useSectionReady()`，不逐层传 prop。
- `SectionViewport` 是 memo 容器：每个章节经 `SectionErrorBoundary` + `Suspense`（`SectionFrame`）包裹；入退场姿态由 `src/lib/section-transition-pose.ts` 的 `resolveSectionPoseKind` 解析（`visible` / `exit` / `enter` / `parked`），邻居章节一律 `parked`（不挂 filter，跨界过渡时不给 GPU 增加全屏 blur 合成层）。
- Context value 必须按依赖边界保持引用稳定；新增跨章节状态时，优先扩展拥有该职责的窄 Context，禁止重新引入通用大对象。

## 显示模式系统（classic ↔ win95 融合）

站点有两种呈现模式：**classic**（本站 fullpage）与 **win95**（新站 Win95 桌面经全屏 iframe 嵌入，`PUBLIC_DESK_URL` 指向 mhk10.example.com）。核心约束：**`<html data-display-mode>` 是唯一信号源**，React 状态、全局 CSS 与防闪烁内联脚本三方共用它，不各持状态。

- **模式状态与默认**：`Layout.astro` 在 `<head>` 输出 `is:inline` 脚本（仅 `PUBLIC_DESK_URL` 配置时），水合前决定目标呈现。`?view=classic|win95` 显式选择在任何路由立即生效并持久化；已保存偏好跟随访客到**所有路由**（深链不再重置模式）；无偏好时**一律先渲染 classic**，桌面作为推荐：`src/hooks/desktop-offer-model.ts` 判断是否在 `/` 的 Hero 显示 `DesktopOffer`（≥1024px、`pointer: fine`、非 Save-Data / 2G、本次会话未回应）。入口卡提供章节色强调、无需联网的像素预览与清楚的接受/关闭按钮。接受经 `requestDisplayMode` 走同一确认和持久化路径；手机、窄屏及省流访问改为可关闭的一行提示。SSR HTML 始终是完整 classic 内容。
- **状态**：`src/hooks/useDisplayMode.ts`（module 级 store + `useSyncExternalStore`，模式同 `useMotionPreference`）。`setDisplayMode` 写 dataset + localStorage（`STORAGE_KEYS.displayMode`，隐私表格自动收录）；显式选择与推荐接受都不写 URL。kill switch：`PUBLIC_DESK_URL` 未配置 → `DESK_EMBED_ENABLED` 为假，恒 classic、命令、推荐与切换按钮均不注册。
- **移动端确认**：`useDisplayModeEntry` + `display-mode-entry-model.ts` 在粗指针或 <1024px 的首次显式进入前弹出 `DesktopEntryNotice`，提示浏览体验可能降级并默认推荐「留在通用版」；确认后写入 sessionStorage `STORAGE_KEYS.desktopEntryNotice`，本次会话不再重复询问。`?view=win95` 与已保存的 win95 偏好视为显式选择，不再拦截。
- **视觉接管**：classic 根节点带 `data-classic-root`，桌面接管时保留 DOM 并设为 `inert`。`Win95Embed` 是常驻的全屏 iframe 宿主，首次选择桌面才设 `src`。停放时 iframe 不接受焦点和指针、暂停帧循环并静音；已有窗口不卸载。桌面目标存在时 `DarkVeil` 固定为静态帧，避免 host WebGL 与 iframe 启动争 GPU。
- **跨源协议**（命名空间 `mhk-fusion`，双向校验 origin + `event.source`）：A→B `suspend` / `resume`（隐藏时停桌面音频与帧循环）；B→A `startup`（桌面 POST/splash 已开始，host 可揭示真实启动动画）/ `ready`（内容就绪）/ `request-classic`（→ `setDisplayMode('classic')`）。B 站以 `?shell=full` 参数挂载完整桌面；`startup` 只在 `phase === 'boot' | 'splash'` 时发送，已预热的桌面仍走 `ready` + 目标导航，避免揭示过期窗口。
- **切换入口**：`DisplayModeToggle`（44px 图标片，默认半透明、仅图标；hover / 键盘 focus 才横向展开目标名；classic 桌面端放在右缘章节点列下方，避免压住进度点与正文；classic 手机端收进顶部导航药丸，避免浮动圆片盖住章节内容；Win95 下保留屏幕边缘返回片）+ 命令面板 `mode-win95` / `mode-classic` + B 站开始菜单「经典模式」，全部经 `requestDisplayMode` 走同一确认/持久化路径。classic 下顶部有一条当前章节 accent 细线，Win95 下变成银色窗口按钮；favicon 由 `presentation-controller.ts` 的 `paint(target, visible)` 随目标模式同步（共享 `data/favicon.ts` 变体与 `useDocumentHead.ts` 的 `syncFavicon`：classic = `favicon.webp`，win95 = 像素头像 `favicon-pixel-*`）。
- **加载与恢复**：`PresentationHandoff` 只在握手较慢时呈现可取消的非模态提示，保持 classic 正文可读。推荐入口在尝试中保留，取消后焦点回到仍可用的原触发控件。失败保留当前内容并提供重试或继续阅读；重试走相同的移动端确认。返回 classic 恢复现有目的地与阅读点后才交焦点；再次进入末次连接不重播开机。装饰与时序见[动效语言](./motion-language.md)。
- **SEO**：SSR HTML 恒为完整 classic 内容，win95 仅水合后视觉接管（DOM 不删）；bots 命中 classic。

## 内容集合

集合在 `src/content.config.ts` 中绑定 loader；博客字段定义于共享的 `packages/site-core/src/content-model/article-schema.ts`：

- `packages/site-core/content/projects/*.md` — 项目卡片（title、date、tags、order、active）；默认按日期倒序，同日以 order 稳定排序
- `packages/site-core/content/blog/**/*.{md,mdx}` — 博客文章（publishDate、tags、draft、featured）

两个 collection 的 `base` 在 `src/content.config.ts` 中通过相对 URL 指向共享目录；应用内不再保留 `src/content/` 内容副本。

`src/lib/projects/index.ts` 与 `src/lib/blog/index.ts` 是 Astro `getCollection` 的薄封装（`@/lib/projects` / `@/lib/blog` barrel 入口）。

## 个人文案入口（扩展点）

个人文案的原始数据位于 **`packages/site-core/content/profile.json`**。管理后台与手动维护都应只修改这个共享 JSON 文件，以保证两个呈现的数据单一来源。

派生数据与类型定义保留在 **`src/data/profile.ts`**：它从共享 `profile.json` 导入原始值，计算 `age`、`honorStats`、`aboutStats` 等运行时派生，并导出强类型接口供组件使用。手写更新时只改共享 JSON，派生值会自动随构建重新计算，不会漂移。桌面版通过 `npm run content:align` 从同一来源生成自己的投影。

友情链接同属个人文案：`profile.json` 顶层 `friendLinks` 字段（name / url / description / group / favicon / addedAt），经 `src/lib/friends.ts` 按命名分组分区（已知组如 `close` →「多年挚友」肖像带；未分组或未知 group id 走普通网格）并解析 favicon 后由 friends 章节消费；favicon 留空时按 `<origin>/favicon.ico` 约定抓取，加载失败降级为名称首字符字母块。friends 章节的评论区复用 `GiscusComments`（样式已抽离至 `src/styles/features/comments.css`，组件自行 import），`term` 固定为 `friends-links`。

## 动效约定（motion token）

- 缓动 / 时长 / 弹簧 token 位于 **`src/lib/motion.ts`**（`motionEase`、`motionDuration`、`springStiff`、`springSoft`、`springHover`）。从这里导入，不要内联 cubic-bezier 值。
- **设备性能轴**：`src/lib/device-performance.ts` 拥有预算表和连续窗口迟滞判定，`src/hooks/useDevicePerformance.ts` 订阅 DarkVeil 的实测帧耗时。每次会话从 high 完整预算开始，持续慢窗口才减少装饰绘制；硬件、视口和网络声明不提前缩短动效。默认 full，系统或手动 reduced 为静态等价体验。命令面板 `perf-full` / `perf-auto` 控制完整或自动渲染，页面上没有性能提示条。过渡乐谱与启动时序不随性能档变化。具体数值见 [`motion-language.md`](./motion-language.md)。
- 分区入场由 `SectionViewport` 和 `SectionReadyContext` 统一拥有：背景、导航、水印和标题同步切换，正文延后同一 scene token 入场。`SectionShell` / `SectionMasthead` 保留整词标题；项目的选中图像、标题、简介与操作是一棵 keyed article，手机与桌面共用精选和网格视图。入口是满宽签名 + 逐字母聚焦 + 指针光斑里的 16 色像素同名，推荐卡停靠在底部细轨；完整传记仍在 About 下方。
- 颜色计算（OKLab mix / shade / hue rotate）：**`src/lib/palette.ts`**。叙事指南：**[docs/motion-language.md](./motion-language.md)**。
- 剪贴板辅助：**`src/lib/clipboard.ts`**（`writeClipboard`，CORS 失败回退）。

## 命令面板（command-registry）

`src/lib/command-registry.ts` 拥有全部命令定义与处理器，分为：

- `createStaticCommands()` — 导航 / 链接 / 动作命令（含 lucid mode、motion tier、随机分区）
- `createDynamicCommands()` — 由数据生成的项目 / 标签 / 技能 / 荣誉命令
- `COMMAND_HANDLERS` — 静态分发表
- `resolveDynamicHandler()` — 生成 id 的运行时前缀回退

`src/components/effects/CommandPalette.tsx` 只管 UI 状态，逻辑全在注册表。面板支持 `:prefix` 查询过滤（`:blog`、`:project`、`:skill` 等）与内联计算器（`=expr` 或 `calc expr`）。motion tier 覆盖通过 `useMotionPreference` 持久化。

搜索由 `useCommandSearch` 使用 `useDeferredValue` 推迟 fuzzy / Fuse 计算。`query !== deferredQuery` 时结果区标记 `aria-busy` 并禁用指针交互，统一的 `execute()` 边界同时拒绝旧结果；新增键盘、点击或程序化执行路径都必须复用该边界，不能绕过 stale guard。

### 命令清单（完整）

命令分三层，以下按 `src/lib/command-registry.ts` 全量列出：

**静态命令**（`createStaticCommands`，label 随 BGM / 灵光 / 专注状态重算）：

| id                                                     | 类型   | label（中 / 英）                                         | 触发动作                                                                                    |
| ------------------------------------------------------ | ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `about` `projects` `skills` `gallery` `blog` `friends` | nav    | `<en> / <zh>`（如 `About / 关于`）                       | `navigate(id)` 翻页跳转对应章节                                                             |
| `github`                                               | link   | GitHub / 代码仓库                                        | `openUrl(profile.github)` 新标签打开                                                        |
| `bilibili`                                             | link   | Bilibili / 哔哩哔哩                                      | `openUrl(profile.bilibili)` 新标签打开                                                      |
| `email`                                                | link   | Email / 邮箱                                             | `openUrl(mailto:)` 唤起邮件客户端                                                           |
| `copy-email`                                           | action | 复制邮箱地址 / Copy Email                                | `copyToClipboard(profile.email)`                                                            |
| `wechat` / `feishu` / `zanshang`                       | link   | 微信好友 / 飞书好友 / 赞赏码                             | `openContactQR(0 / 1 / 2)` 灯箱展示二维码图                                                 |
| `resume-pdf`                                           | action | 导出 PDF 简历 / Export Resume                            | `openUrl('/resume?print=1')` 打印预览另存 PDF                                               |
| `goto-home`                                            | action | 回到顶部 / Back to Start                                 | `navigate(ROOT_SECTION_ID)` 跳转根章节（about）                                             |
| `goto-last`                                            | action | 跳到末页 / Go to Last → `<末章 en>`                      | 跳转末章                                                                                    |
| `toggle-bgm`                                           | action | 播放 / 暂停背景音乐（label 随播放状态切换）              | `toggleBGM()`                                                                               |
| `random-section`                                       | action | 随机漫游 / Random Section                                | 随机跳转非当前章节                                                                          |
| `lucid-mode`                                           | action | 灵光模式 / Lucid Mode（开启时变「退出」）                | `toggleLucidMode()`                                                                         |
| `zen-mode`                                             | action | 专注模式 / Zen Mode（开启时变「退出」）                  | `setZenMode(!getZenMode())`（`@/lib/blog/reading-prefs`）                                   |
| `motion-full` `motion-mobile` `motion-reduced`         | action | 动效：完整 / 精简 / 静态（Motion: Full / Lite / Static） | `setMotionOverride(level)`，经 `useMotionPreference` 持久化                                 |
| `perf-auto`                                            | action | 动效：性能自动 / Perf: Auto                              | `setPerfOverride('auto')` 恢复持续帧耗时自适应                                              |
| `perf-full`                                            | action | 动效：完整渲染 / Perf: Full                              | `setPerfOverride('high')` 固定完整装饰预算                                                  |
| `mode-win95` `mode-classic`                            | action | 桌面模式 / Desktop Mode、经典模式 / Classic Site         | `setDisplayMode('win95' / 'classic')`（仅 `DESK_EMBED_ENABLED` 时注册，见「显示模式系统」） |

**动态命令**（`createDynamicCommands` + 搜索期生成）：

| id 模式          | 数据来源                                                                      | 触发动作                                         |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `project-<id>`   | `packages/site-core/content/projects/*.md`                                    | `navigateToItem('projects', …)` 跳转并高亮项目卡 |
| `tag-<tag>`      | 文章标签（去重排序）                                                          | `openUrl('/blog/tag/<tag>')` 打开标签页          |
| `skill-<name>`   | `profile.json` skills                                                         | `navigateToItem('skills', …)` 跳转并高亮技能     |
| `honor-<index>`  | `profile.json` honors（挂 about 章）                                          | `navigateToItem('about', …)` 跳转并高亮荣誉卡    |
| `article-<slug>` | 搜索期由 `useCommandSearch` 生成（Fuse 全文 / `:blog` 前缀 / 最近文章 top 3） | `navigateToArticle(slug)` SPA 进入文章阅读模式   |

**`:prefix` 查询语法**（`parseQueryPrefix`）：`:cmd`（单独 `:` 同义）只搜静态命令；`:blog` 只搜文章（`:article` 为别名）；`:project` / `:tag` / `:skill` / `:honor` 限定对应动态组；未知前缀按普通全量搜索处理。

**内联计算器**（`computeCalcInfo`）：`=expr`、`calc expr`、`计算 expr` 三种前缀触发；表达式先经 `CALC_ALLOWED` 白名单（`/^[\d+\-*/().%\s]+$/`）过滤，含非法字符提示「表达式包含非法字符」，非法表达式提示「表达式无效」；计算成功时结果置顶为 `copy-result` 命令（`复制结果 <value>`，Enter 复制到剪贴板）。`copy-result` 由组件内联处理（需要当前计算值这一瞬态状态），不经过 `resolveDynamicHandler`。

**执行分派**：先查 `COMMAND_HANDLERS` 静态分发表，未命中再走 `resolveDynamicHandler` 的前缀回退（`article-*` / `tag-*` / `project-*` / `skill-*` / `honor-*`）；两者都不命中则不执行。

## 音频系统

背景音乐与全部 UI 音效由 `src/hooks/useAudioSystem.ts` 的单一音频图管理：

- **懒加载**：`AudioContext` 与 BGM `<audio>`（`/bgm.mp3`，`loop`、`preload="none"`、`volume = 0.3`，常量 `BGM_VOLUME`）直到首次显式 toggle 才创建；浏览器自动播放策略要求 `resume()` 发生在用户手势内，这也是播放入口必须是显式操作的原因。组件卸载时断开 source / analyser 并关闭 context。
- **图结构**：`MediaElementSource` → `AnalyserNode`（`fftSize = 64`、`smoothingTimeConstant = 0.82`）→ `destination`。`analyserRef` 暴露给 `Navigation` 的 `FFTVisualizer`（导航栏 5 条低中频柱状动画，`frequencyBinCount` 32 中取低 60% 区间 bin）与命令面板首页（`CommandPaletteHome` 同款）；`reducedMotion` 下绘制静态条、不跑动画循环。
- **UI 音效**：`nav` / `hover` / `transition` 三种 oscillator 音效（`SFX_SPECS`：nav 方波 180→140Hz 0.08s、hover 三角波 520→480Hz 0.03s、transition 锯齿波 220→560Hz 0.15s），分别接到翻页导航、导航悬停与章节过渡；**只在 BGM 播放中发声**（`playingRef` 守卫），`reducedMotion` 时全部静音。
- **唯一入口**：命令面板 `toggle-bgm` 与 `Navigation` 的 BGM 按钮调用同一个 `toggle()`，无其他播放路径。
- **TTS 暂停 BGM**：`useArticleSpeech` 每次朗读状态变更派发 `portfolio:tts-speaking` 自定义事件（`detail.speaking`）；`App.tsx` 监听该事件，`speaking` 且 BGM 播放中即 `toggleBGM()` 暂停，避免朗读与背景音乐叠加。
- **同源原因**：`/bgm.mp3` 必须与站点同源部署（`public/bgm.mp3`）——Web Audio `MediaElementSource` 接入分析器的音频在跨域（`static.example-cdn.example.com` 不返回 CORS 头）时会被静音，详见 [`r2-images.md`](./r2-images.md) 同源表。

## 无障碍机制

- **章节切换后的焦点管理**（`App.tsx`）：过渡落定（`transitionPhase === 'idle'` 且 `contentReady`）后把焦点移到当前章节容器（`sectionRefs[activeIndex].focus({ preventScroll: true })`，容器 `tabIndex={-1}`）；首次 boot 不抢焦点（`hasTransitionedRef` 只在经历完整过渡后置真）。非活跃章节容器 `aria-hidden` + `inert`；`#main-content`（`tabIndex={-1}`）是 `Layout.astro` skip link「跳到主要内容」的目标。
- **焦点陷阱**（`src/hooks/useFocusTrap.ts`）：激活时把焦点限制在容器内可见可聚焦元素，`Tab` / `Shift+Tab` 循环，`Esc` 触发 `onEscape` 回调，关闭时焦点还原到打开前元素；`onEscape` 经 ref 读取最新值，避免打开期间重建陷阱导致焦点还原失效。使用方：命令面板、移动导航抽屉（`Navigation`）、移动 TOC（`MobileTOC`）、后台 dialog（`src/admin/ui/primitives/dialog.tsx`）。
- **命令面板延迟搜索**：`useCommandSearch` 以 `useDeferredValue` 推迟 fuzzy / Fuse 计算，`query !== deferredQuery`（`isStale`）时结果区 `aria-busy` + `pointer-events-none`，且统一 `execute()` 边界拒绝旧结果（见命令面板小节）。
- **`:focus-visible` 基线**（`src/styles/foundations/base.css`）：全局 `:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--section-accent-ink) }` —— 2px 章节色 ring，随主题色变化；移除 outline 的组件必须自备等价 ring（博客侧约定见 `src/styles/features/blog/article-shell.css` 注释）。skip link 默认移出视口（`top: -100px`），`:focus-visible` 时滑入左上角。
- **对比度计算**（`src/lib/accent.ts`）：`deriveAccent` 的 `ink` 在暗底上推亮至 lightness ≥ 0.68、亮底压暗至 ≤ 0.46（OKLab shade 步进 0.06，最多 24 步），保证文字与底色对比；`on` 按 base 亮度 > 0.62 选 `#0A0A0A` 否则 `#FFFFFF`；`contrastRatio` 为 WCAG 2.x 对比度计算（`src/lib/palette.test.ts` 校验品牌色合规）。
- **读屏播报**：复制 / 分享 / 朗读等异步状态用 `sr-only` + `role="status"` / `aria-live="polite"` 播报（`AIShareMenu`、`ArticleShareActions`、`ArticleView`）；Gallery 排序用 `sr-only` 的 `<label>`；灯箱 chrome 有计数 `aria-live`。
- **错误边界**：`SectionErrorBoundary` 兜住懒加载章节失败，渲染 `role="alert"` 错误面板 +「重新加载」整页刷新按钮；Suspense fallback（`SectionFallback`）标 `aria-busy="true"`。
- **BootLoader**：`<html>` 在遮罩展示期间持 `aria-busy`，`useBootLoader` 兜底路径与内联脚本 `complete()` 对齐：移除遮罩元素并清除 `aria-busy`（见渲染模型）。

## 项目展示交互

`ProjectShowcase` 在桌面端组合精选卡片与 `ProjectQueue` sidebar，在移动端由 `ProjectsSection` 使用 stack queue。列表项采用两个平级按钮：主按钮选择项目，详情按钮打开灯箱；禁止嵌套 `<button>`。移动端可操作区域需覆盖整行（边框除外），图标详情按钮至少 `44 × 44px`，active indicator 必须 `pointer-events: none`。

## 管理后台

`/admin` 是一个构建为静态页面、运行时 client-only 的 React 19 管理后台。管理员在浏览器中直接操作 GitHub API，向仓库 `main` 分支提交内容变更，提交后由托管平台按配置重新构建并部署站点。

### 文件地图

- `src/admin/config.ts` —— 仓库、分支、内容目录与图片目录常量。
- `src/admin/github/client.ts` —— PAT 存取、`apiFetch`、token 校验与 `GitHubError`。
- `src/admin/github/store.ts` —— Git Data API 读写：`getTextFile`、`listRepoPaths`、`commitFiles`、`deleteFiles`、`getRecentCommits`。
- `src/admin/content/frontmatter.ts` —— Markdown frontmatter 拆分与序列化。
- `src/admin/content/slug.ts` —— slug 校验与生成。
- `src/admin/image/derivatives.ts` —— 浏览器端 Canvas 生成 display（1920px 长边）WebP，规格与 `scripts/optimize-images.mjs` 一致。
- `src/admin/schema/` —— 后台表单 schema 单一来源（blog / project frontmatter、profile.json 各节，`index.ts` 聚合）。
- `src/admin/ui/primitives/` / `SchemaForm.tsx` / `panels/` —— 后台 UI 原语、根据 schema 渲染表单以及各内容类型的管理面板。
- `src/pages/admin.astro` —— 挂载后台 SPA 的 Astro 路由。

### 提交与冲突重试

`commitFiles` / `deleteFiles` 使用 Git Data API 新建 blob、tree、commit，最后将 `heads/main` 指向新 commit。若期间 ref 被其他提交移动导致 `422` 冲突，`commitWithRetry` 会最多重试 3 次，之后抛出可感知的错误。

### 图片派生

上传的图片在浏览器端通过 Canvas 生成一条展示派生：

- **display**：长边 1920px，WebP，用于灯箱 / 大图展示；

尺寸逻辑与 `scripts/optimize-images.mjs` 保持一致，均按 contain 模式缩放并保留原始宽高比。

## 目录结构

- `src/components/effects/` — 视觉效果 + 命令面板（DarkVeil、SplitHeading、CommandPalette* 等）
- `src/components/rail/` — 装饰性左侧章节栏（SectionRail）
- `src/components/chrome/` — 常驻 UI（BackToStart、BeianFooter、ShortcutHint、WatermarkLayer、DisplayModeToggle 等）
- `src/components/embed/` — 跨站嵌入宿主（Win95Embed iframe）
- `src/components/sections/` — 分区组件，复杂分区带子目录（about、projects、skills）；根章节为 about（原 Home 分区已删除）
- `src/components/blog/` — 博客组件与 `BlogSectionContext`（ArticleView、AIShareMenu、enhancers 等）
- `src/components/layout/` — 页面布局原语与分区级 `SectionAppContext`
- `src/components/motion/` — `SectionReadyContext`、滚动容器与 `Swap` 原语
- `src/components/ui/` — 共享 UI 原语（GlassSurface、SurfacePanel、SiteImage、ThinkingState、badge）

## 样式系统

样式按「foundations（全局 token 与基础）+ features（博客 / 评论区）+ pages（简历 / 404）

- 组件共置 CSS」分层，token 单一来源为 `src/styles/foundations/tokens.css`；后台独立
  入口 `admin.css` 不继承 fullpage 滚动锁定与站点专属规则。品牌缓动字符串由页面根节点
  从 `src/lib/motion.ts` 的 `motionEaseCss` 发布为 `--ease-brand`。分类、归属、行内样式
  例外与新增样式流程见 [`style-system.md`](./style-system.md)。

## 路径别名

`@/` 解析到 `src/`，所有内部导入使用该别名。

## 部署

静态构建，无 Astro 适配器：`npm run build:general` 输出 `apps/general/dist/`，可交给任意静态托管或 CDN（见 [`deployment.md`](./deployment.md)）。字体（5）：HarmonyOS Sans SC（local）、Space Grotesk（Google）、Instrument Serif（Fontsource）、JetBrains Mono（Fontsource）、Dancing Script（Google，仅 `.rail-vertical-title`）。详情见 [`typography.md`](./typography.md)。Astro 页面预取关闭：站内导航由 React fullpage + `history.pushState` 接管，预取整页 HTML 没有消费路径。Vite 手动分块拆出 `motion`、`react`（含 `react-dom`）与 `ogl`，并通过 `resolve.dedupe` 保证 React 单实例。

### 环境变量

| 变量                    | 用途                                                                                                                                    | 使用位置                                                                                                                                  | 事实来源                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PUBLIC_IMAGE_BASE_URL` | 图片 CDN 基座（生产 `https://static.example-cdn.example.com`）；未配置时回退同域 `public/images/`                                       | `src/lib/images/url.ts`（`IMAGE_BASE_URL` / `resolveImageSrc`）                                                                           | [`r2-images.md`](./r2-images.md)「环境变量」、`apps/general/.env.example` |
| `PUBLIC_DESK_URL`       | B 站 Win95 桌面地址（`https://mhk10.example.com`）；**未配置 → win95 模式整体旁路**（恒 classic、切换 UI 不渲染），见「显示模式系统」   | `src/hooks/useDisplayMode.ts`、`Layout.astro` 防闪烁脚本、`BaseHead.astro` preconnect、`Win95Embed.tsx`                                   | `apps/general/.env.example`、[`deployment.md`](./deployment.md)           |
| `PUBLIC_KOUNTER_URL`    | 可选；覆盖 OpenKounter 默认地址 `https://counter.example.com`                                                                           | `src/lib/kounter/index.ts`                                                                                                                | `apps/general/.env.example`、[`deployment.md`](./deployment.md)           |
| `PROD` / `DEV`          | Astro 内置构建标记：`PROD` 时 `draft: true` 文章不发布（dev 可见）；`DEV` 才输出 DarkVeil WebGL fallback 诊断 warning（每阶段至多一次） | `src/lib/blog/index.ts`、`src/components/effects/DarkVeil.tsx`                                                                            | —                                                                         |
| `R2_ENDPOINT`           | S3 virtual-hosted endpoint（含 bucket 名），管理端直传                                                                                  | `scripts/sync-images.mjs`（`node --env-file-if-exists=.env`）、`/admin` 浏览器（存 `localStorage['mirahikari-portfolio:admin:cred:r2']`） | [`r2-images.md`](./r2-images.md)「环境变量」、`.env.example`              |
| `R2_ACCESS_KEY_ID`      | R2 API token access key id                                                                                                              | 同上                                                                                                                                      | 同上                                                                      |
| `R2_SECRET_ACCESS_KEY`  | R2 API token secret                                                                                                                     | 同上                                                                                                                                      | 同上                                                                      |

凭据类变量（`R2_*`）不入库：`.env` 已 gitignore，参照 `.env.example` 配置；后台由用户输入后存 localStorage，与 GitHub PAT 同级管理。

## 图片与静态资源

图片已托管到 Cloudflare R2，构建产物不再携带 `public/images/`（可随部署需要移除）。站点渲染时通过 `src/lib/images/url.ts` 的 `resolveImageSrc()` 将 `/images/<folder>/<name>` 拼接到 `PUBLIC_IMAGE_BASE_URL`（生产环境为 `https://static.example-cdn.example.com`），未配置时回退到同域 `public/images/`。

Gallery / projects / contact QR / honors / avatar 等路径由 React 岛以字符串 URL 消费，仍无法使用 `astro:assets` 的 `<Image>`。列表和灯箱统一加载 1920px 长边的 `-display.webp` 展示图（由 `npm run images:optimize --workspace @mhk/general` 从原图生成，见 `apps/general/scripts/optimize-images.mjs`）；原图保留相机分辨率，仅作为 `downloadSrc` 供 `FULL RES` 查看或下载。新增照片时仍需记录 ISO 日期、展示日期、原始宽高和策展 `order`，不再生成独立缩略图。

博客正文照片走同一条管线：图片放 `public/images/blog/<文章 slug>/`（optimize / sync 脚本均递归处理），MDX 里用 `src/components/blog/PhotoFigure.astro` / `PhotoSet.astro` 引用（构建期 `resolveImageSrc` 解析），客户端 `enhanceArticleImages` 把 figcaption / `data-full` / `data-date` 提升为灯箱的标题、FULL RES 下载与拍摄时间。

灯箱由 [yet-another-react-lightbox](https://yet-another-react-lightbox.com)（YARL）驱动（`src/components/effects/Lightbox.tsx` 壳 + `src/components/effects/lightbox/lightbox.css` 皮肤）：gallery 变体启用官方 Zoom / Fullscreen / Slideshow / Share 插件，翻页（键盘 ←/→、桌面箭头、移动横滑）、滚轮 / 双击 / 双指缩放、下拉关闭、点空白关闭与幻灯片播放全部由 YARL 核心与插件接管；Home/End 跳转经 controller ref 补齐。站点定制只保留两块：自定义 chrome（顶部分类、底部信息栏 — 标题 / FULL RES 下载 / SOURCE / 计数，经 `render.controls` 注入）与 project 变体的项目详情卡片（自定义 slide 类型）。动画时长 / 缓动沿用 `src/lib/motion.ts` 的 lightbox / control 令牌，z-index 经 `--yarl__portal_zindex` 对齐 `zIndex.lightbox`，门户节点带 `data-lightbox` 属性以维持 Lenis 滚轮豁免。

YARL 是**按需加载**：`Lightbox.tsx` 只留壳（props 契约与关闭动画语义不变），首次打开时才动态 import 完整子树（`src/components/effects/lightbox/`，含 YARL 核心、官方插件与 `styles.css`），首屏主包不含 YARL；App 在 contentReady 后经 requestIdleCallback 空闲预载整个 `./effects/lightbox` 子树（只预载核心仍会在首开时拉插件与样式），打开灯箱近乎零等待。打开灯箱的同时会预取当前条目的 `downloadSrc` 原图（放大 / FULL RES 更顺，省流 / 2G 自动跳过）。

本地同步使用 `npm run images:sync --workspace @mhk/general`（dry-run 默认，加 `--apply` 执行，支持 `--delete` / `--delete-thumbnails` / `--force`）；`/admin` 后台的图片上传改为浏览器端生成展示图后直传 R2，元数据仍通过 GitHub commit 提交。详见 [`r2-images.md`](./r2-images.md)。
