# 字体系统（Typography）

本文是全站字体角色、加载方式与使用规则的唯一事实来源。字号与字距 token
仍属 [`style-system.md`](./style-system.md) / `tokens.css`；动效不在此文。

## 角色

| 角色         | 字体                              | Face 变量                                  | 语义 token                     | Tailwind     | 用途                                     |
| ------------ | --------------------------------- | ------------------------------------------ | ------------------------------ | ------------ | ---------------------------------------- |
| Sans         | Space Grotesk + HarmonyOS Sans SC | `--font-space-grotesk`, `--font-harmonyos` | `--font-sans`                  | `font-sans`  | UI、导航、按钮、正文、表单、后台         |
| Serif        | Instrument Serif                  | `--font-instrument-serif`                  | `--font-serif`                 | `font-serif` | 展示标题、masthead、水印、荣誉标题、引言 |
| Mono         | JetBrains Mono                    | `--font-jetbrains`                         | `--font-mono`                  | `font-mono`  | 代码、eyebrow、数据标签、快捷键、遥测    |
| 色带垂直标题 | Dancing Script                    | `--font-dancing-script`                    | —（仅 `.rail-vertical-title`） | —            | 左侧色带章节竖排标题                     |

新增字体（含替换现有展示体）必须先更新本文角色表与加载表，再改配置与调用点。

## 加载与 preload

定义于 `astro.config.ts` 的 `fonts[]`，由 `src/components/seo/SiteFonts.astro` 发出：

| 模式         | 加载                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| site（默认） | Space Grotesk、HarmonyOS、JetBrains Mono、Instrument Serif、Dancing Script |
| resume       | Space Grotesk、HarmonyOS                                                   |

Instrument Serif 通过 Fontsource provider 加载，权重仅 `400`，样式 `normal` + `italic`；Italic 按需 swap。Dancing Script 通过 Google Fonts 加载（handwriting 展示体），权重 `400`–`700` 可变区间，仅 `.rail-vertical-title` 使用；site 模式不 preload（根章节 About 首屏无 rail，随章节切换按需加载）。

## 使用规则

1. Serif 仅 Regular 400。禁止 `font-serif` / `text-display` 与 `font-bold` / `font-semibold` / `font-black` 同用。
2. Serif 默认 roman；italic 仅用于强调（引言、荣誉标题、masthead accent、Skills 旁白）。
3. 三套 stack 均以 `--font-cjk-fallback`（HarmonyOS → 系统无衬线）收尾；不引入中文衬线。
4. `text-display` = serif 展示姿态（`font-family: var(--font-serif)`；weight 400；`letter-spacing: -0.02em`；`line-height: 0.95`）。
5. 编号 / rail / 项目序号 / 荣誉大数字 → `font-mono`。密集列表标题 → `font-sans` + 字重，不用 `text-display`。
6. Dancing Script 是色带垂直标题专用 handwriting 展示体：仅允许 `.rail-vertical-title`（`src/components/rail/section-rail.css`）引用 `var(--font-dancing-script)`，粗字重（可变区间 400–700，900 书写会被浏览器收敛到 700）；禁止扩散到水印、masthead、荣誉标题等任何其他展示元素。`.rail-vertical-title` 不受第 1 条 400 禁令约束。色带编号（`01/06`）与底部小标签仍走 Mono。

## 场景速查

| 场景                   | 角色                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| 章节 masthead 主标题   | Serif via `text-display`                                                                           |
| Masthead accent        | Serif italic                                                                                       |
| Quiet 标题             | Sans（`text-display-m` + semibold）                                                                |
| 作者入口姓名           | Sans semibold；桌面满宽单行、手机 `Mira` / `Hikari` 两行，逐字母聚焦；像素光斑是同一名字的第二呈现 |
| 章节水印               | Serif                                                                                              |
| 色带垂直标题           | Dancing Script 粗字重（`.rail-vertical-title`）                                                    |
| 色带编号 / 项目编号    | Mono                                                                                               |
| 荣誉标题 / Skills 旁白 | Serif（可 italic）                                                                                 |
| 博客 metric 数字       | Mono                                                                                               |
| Lightbox 展示标题      | Serif via `text-display`                                                                           |
| 项目卡密集标题         | Sans bold                                                                                          |

## 例外

- `/resume`：独立浅色打印栈（Space Grotesk + HarmonyOS + 系统等宽），不加载 Instrument Serif。
- `/admin`：Sans / Mono，无展示衬线义务。

## 变更流程

1. 先改本文角色表与规则。
2. 再改 `astro.config.ts` / `SiteFonts.astro` / `theme.css` / `utilities.css`。
3. 迁移调用点；扩展 `src/lib/style-guard.test.ts` 的 typography contract 如有新禁令。
4. 验证：`npm run check --workspace @mhk/general && npm test --workspace @mhk/general && npm run build:general`，并以 `npm run dev:general` 目视 masthead、水印、About、Projects 编号。
