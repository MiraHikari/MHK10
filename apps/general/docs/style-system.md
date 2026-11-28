# 样式系统（Style System）

本文是 `src/styles/` 与组件样式归属的事实来源：token 分类、文件职责、行内
样式例外、页面入口与新增样式的流程。修改样式前先读本文件与
[`motion-language.md`](./motion-language.md)（动效数值在后者）。

---

## 目录结构与归属

```
src/styles/
  global.css          # 公共站点样式聚合入口（tailwindcss + lenis + foundations；页面与组件样式由各自入口按需引入）
  admin.css           # 后台独立入口（不继承 fullpage 滚动锁定 / 光标 / 章节色）
  foundations/
    tokens.css        # 静态设计 token 唯一来源（品牌色 / 中性色 / 表面 / 文本层级 / 阴影 / 圆角）
    theme.css         # Tailwind 4 语义类映射（@theme inline：颜色 / 字号 / 字距 / 阴影）
    base.css          # 全局基础：元素默认、滚动条、fullpage 锁定、选区、:focus-visible 基线、字号断点、显示模式（data-classic-root 的 opacity/scale 让位）
    utilities.css     # 命名工具类（text-display / font-* / vertical-text / command-target-highlight）
    motion.css        # 共享 keyframes 与 reduced-motion / 手动静态档抑制
  features/
    comments.css      # 评论区（giscus）共享样式
    fusion.css        # classic ↔ Win95 可见层、入口棱镜、连接状态牌
    blog/
      index.css       # 博客聚合入口（按顺序引入下列分片）
      listing.css     # 列表：标签云 / post-card / 遥测条 / 筛选 / 空状态 / 订阅
      article-shell.css # 文章框架：双栏布局 / 操作条 / 上下篇 / 关系图 / AI 标识 / 版权 / 系列 / TOC 骨架
      prose.css       # 正文排版：标题 / 段落 / 锚点 / 表格 / 脚注
      media.css       # 照片游记 / 代码块 / 长块折叠
      reading-tools.css # 段落高亮 / 朗读 live / 选区胶囊 / 阅读控件 / 专注模式
      responsive.css  # 移动端适配（max-width 断点集中）
      print.css       # 打印样式（浅色例外）
  pages/
    resume.css        # 简历页（独立浅色打印页，自行导入 tokens）
    not-found.css     # 404 页
```

组件专属 CSS 与组件共置（不进入 `src/styles/`）：

| 文件                                           | 组件                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `src/components/effects/boot-loader.css`       | BootLoader 静态 BEM（首屏关键规则仍内联在组件）                         |
| `src/components/effects/cursor.css`            | 自定义光标初始样式与过渡                                                |
| `src/components/effects/ink-ripple.css`        | 「墨滴」点击反馈（单 span、transform/opacity）                          |
| `src/components/effects/lightbox/lightbox.css` | YARL 皮肤（`.pf-lightbox` 作用域）                                      |
| `src/components/effects/DarkVeil.css`          | WebGL veil 的 CSS 回退层                                                |
| `src/components/sections/about-entry.css`      | 作者入口：满宽签名、像素光斑、精选作品、主题化 Desktop 推荐卡及手机提示 |
| `src/components/section-scene.css`             | 标题与正文共享就绪信号的协同入场                                        |
| `src/components/rail/section-rail.css`         | 左侧章节色带（`--rail-base` 同时被 SectionCanvas 消费）                 |
| `src/components/ui/GlassSurface.css`           | 毛玻璃表面（Apple 系统蓝例外）                                          |

---

## Token 分类（tokens.css）

字体角色（Sans / Serif / Mono）、加载与 `text-display` 合同见 [`typography.md`](./typography.md)。
本文只保留字号 / 字距 token 与样式文件归属。

| 组            | 变量                                                                                                                                                                        | 说明                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 品牌色        | `--brand` `--brand-hover` `--brand-soft` `--brand-on`                                                                                                                       | 品牌蓝唯一来源之一（白名单见 `architecture.md`）          |
| 中性色        | `--neutral-50 … --neutral-975`                                                                                                                                              | 黑白 / 灰阶字面量的统一替换入口                           |
| 文本层级      | `--ink-on-dark*` `--accent-blue*`                                                                                                                                           | 深色界面文本阶与静态 accent 蓝阶                          |
| 表面          | `--background` `--card` `--popover` 等 shadcn 语义名（另有 `--code-bg` 代码块表面、`--accent-hover` / `--accent-text-on-dark` / `--accent-text-on-light` 静态 accent 派生） | 供 `theme.css` 映射为 `bg-*` / `text-*`                   |
| 边框 / 焦点环 | `--border` `--input` `--ring`                                                                                                                                               | 浅色边框与焦点环                                          |
| 阴影          | `--shadow-panel` `--shadow-panel-light` `--shadow-pop` `--shadow-lift`                                                                                                      | 深/浅浮层、提示气泡、悬浮层                               |
| 圆角          | `--radius`（4px）                                                                                                                                                           | sm/md/lg/xl 由 theme.css 派生                             |
| 字号          | `--text-display-m` `--text-caption` `--text-micro`                                                                                                                          | 固定值 + 断点（base.css），不用 vw 缩放                   |
| 标签字距      | `--tracking-label` `--tracking-eyebrow` `--tracking-mono`                                                                                                                   | mono eyebrow 语言的刻意例外；正文字距统一为 0             |
| Win95 呈现    | `--win95-desktop` `--win95-navy` `--win95-silver` `--win95-aqua` `--win95-blue` `--win95-white` `--win95-black`                                                             | 仅 host 的 Win95 进度轨 / 连接指示 / 返回控件；不参与正文 |

**动态值**（不属于 tokens.css 的静态分类）：`--section-accent*` 由 `useSectionAccent`
在每次章节切换时发布（`--section-accent-ink` / `--section-accent-on` 经
`src/lib/accent.ts` 的 `deriveAccent` 派生；tokens.css 仅保留水合前的品牌蓝
回退值，Layout.astro 按直链章节输出 SSR 初始值）；`--ease-brand` 由页面根节点
（Layout.astro）从 `src/lib/motion.ts` 的 `motionEaseCss` 内联发布。交错层 z
序见 `src/lib/z-index.ts`（阅读进度 / 移动 TOC / 灯箱 portal）。

Desktop 推荐卡使用 `--card` / `--card-foreground` 保持入口表面的对比度，
强调边、按钮和状态标记消费当前 `--section-accent*`，可随 Lucid 色相变化。
像素桌面预览只消费已有 `--win95-*`，由内联 SVG 绘制，不发起图片或桌面
请求。提示按钮最小高度 44px；响应式布局只改变卡片的预览和间距。

## 行内样式例外（style 属性）

`style={{...}}` 只允许承载动态值：MotionValue、运行时 accent 派生
（`withAlpha` / `color-mix(var(--section-accent)...)`）、shader / canvas
参数、CSS 自定义属性（`var(--rail-base)` 等）、`env(safe-area-*)` 定位、
z-index、按 rect / 视口计算的尺寸。静态颜色 / 阴影 / 尺寸 / transition
一律进 CSS（共置文件或 Tailwind 语义类）。

## 页面入口

| 页面                                        | 样式入口                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 公共站点（index / [section] / blog* / 404） | `global.css`（404 追加 `pages/not-found.css`）                                                                |
| 博客路由（SSR）                             | `global.css` + `features/blog/index.css`；SPA 内由 `src/lib/blog/css.ts` 的 `ensureBlogStyles()` 按需注入一次 |
| 后台 `/admin`                               | `admin.css`（独立，无 fullpage / 光标 / 章节色规则）                                                          |
| 简历 `/resume`                              | `pages/resume.css`（独立浅色页，自行导入 tokens.css 并覆写 `color-scheme: light`）                            |

## 字面量白名单

基础色字面量只允许出现在以下例外（静态测试 `src/lib/style-guard.test.ts`
强制执行，新增例外需同步更新）：

- `tokens.css`（token 定义本身）、`src/lib/sections.ts`（章节主题色数据源）
- `pages/resume.css`（简历浅色打印字阶）、`features/blog/print.css`（打印浅色）
- `GlassSurface.css` 的 Apple 系统蓝（`#0a84ff` / `#007aff`）
- 单次语义色：`#9db8e8`（行内代码）、`rgb(216,180,112)`（AI 标识琥珀金）、
  `#6CE5E8`（命令面板 OK 状态）、`#f7f7f8` / `#EEF2F7`（浅色表面单例）
- 透明度阶梯：`rgba(255,255,255,*)` / `rgb(255 255 255 / *)`、
  `rgba(10,10,10,*)`、`rgba(0,0,0,*)`、`rgba(17,17,26,*)`、
  `rgba(111,147,196,*)`（accent 蓝 alpha 族）、`rgba(216,180,112,*)`（AI 标识琥珀金 alpha 族）
- 测试夹具（`*.test.ts`）

## 新增样式流程

1. 颜色 / 圆角 / 阴影 / 字号先查 `tokens.css` 是否已有语义 token；没有则在
   tokens.css 定义（同时补 `theme.css` 的 `@theme inline` 映射）。
2. 组件专属规则放组件同目录 CSS 文件并在组件内 import；全局规则按职责放入
   `foundations/` 或 `features/` 对应分片。
3. 品牌蓝 `#254378` 只允许出现在 tokens.css 与 sections.ts。
4. 动效数值 / 缓动引用 `src/lib/motion.ts`；CSS 中不得复制
   `cubic-bezier(0.22, 1, 0.36, 1)`（用 `var(--ease-brand)`）。
5. 圆角不超过 8px（`rounded-xl`，即 `--radius + 4px`）；触控目标 ≥ 44px；焦点态走
   `:focus-visible` 基线或 `ring-accent-base`。
6. 正文字距为 0；标签字距用 `tracking-label` / `tracking-eyebrow` /
   `tracking-mono`。
7. 静态样式不写入 React `style` 属性（见行内样式例外）。
8. 修改后运行 `npm run check --workspace @mhk/general && npm test --workspace @mhk/general && npm run build:general`（或在仓库根目录运行 `npm run verify`）。
