# 通用版文档中心

本文是 `apps/general` 的文档入口。应用简介、快速开始与常用命令见
[`README.md`](../README.md)；本页按任务类型索引架构与设计文档。

本应用是 `@mhk/general`，属于 MHK10 npm workspace。共享作者内容在
`packages/site-core/content`，融合协议与阅读模型在
`packages/site-core/src/fusion`；构建与验证命令从仓库根目录执行。

## 文档地图

| 文档                                         | 面向对象         | 内容                                               |
| -------------------------------------------- | ---------------- | -------------------------------------------------- |
| [`README.md`](../README.md)                  | 访客与新贡献者   | 项目简介、快速启动、常用命令、文档入口             |
| [`architecture.md`](./architecture.md)       | 开发者           | 渲染模型、状态边界、扩展点、命令面板、部署架构     |
| [`style-system.md`](./style-system.md)       | UI 开发者        | token 分类、样式归属、行内样式例外、新增样式流程   |
| [`typography.md`](./typography.md)           | UI 开发者        | 字体角色、加载、使用规则、场景速查                 |
| [`motion-language.md`](./motion-language.md) | UI / 动效开发者  | 动效叙事、motion token、性能与 reduced-motion 约束 |
| [`r2-images.md`](./r2-images.md)             | 内容与图片维护者 | 图片地址、派生图、同步、后台上传、故障排查         |
| [`blog-publishing.md`](./blog-publishing.md) | 博客维护者       | 博客内容模型、frontmatter 字段、发布流程、收录规则 |
| [`admin-guide.md`](./admin-guide.md)         | 内容管理员       | 后台操作步骤、凭据获取与存储、保存链路、冲突处理   |
| [`deployment.md`](./deployment.md)           | 开发者 / 运维    | 静态托管、CI、SEO 输出、环境变量、故障排查         |
| [`giscus-setup.md`](./giscus-setup.md)       | 博客维护者       | 评论系统配置与故障排查                             |

## 阅读顺序建议

- 第一次接触本应用：先读 [`README.md`](../README.md)，再读
  [`architecture.md`](./architecture.md)。
- 修改界面：读 [`style-system.md`](./style-system.md)、
  [`typography.md`](./typography.md) 与 [`motion-language.md`](./motion-language.md)。
- 修改内容或图片：读 [`blog-publishing.md`](./blog-publishing.md)、
  [`admin-guide.md`](./admin-guide.md) 与 [`r2-images.md`](./r2-images.md)。
- 准备发布：读 [`deployment.md`](./deployment.md)。

## 维护规则

1. 代码行为变化时，先更新拥有该事实的专题文档，再更新入口文档中的摘要或链接。
2. 架构细节只写在 `architecture.md`；`README.md` 不复制实现说明。
3. 动效数值与语义只写在 `motion-language.md`，图片规格只写在 `r2-images.md`，
   样式 token 与归属只写在 `style-system.md`，字体角色与加载只写在
   `typography.md`。
4. 命令、包管理器版本、目录名和部署行为必须从当前仓库配置核对，不凭历史
   记录更新。
5. 删除或重命名文档时，同步检查本页与 `README.md` 的链接。

## 验证

常用验证命令（在仓库根目录执行）：

```sh
# 日常改动
npm run check --workspace @mhk/general
npm test --workspace @mhk/general

# 涉及路由、内容集合、依赖或配置
npm run build:general

# 全量门禁
npm run verify
```

`npm run preview` 用 Vite+ 静态预览服务 `apps/general/dist` 与
`apps/desktop/dist`，端口分别为 4321 和 4322。页面与交互验收也可以使用
`npm run dev:general`，默认地址为 <http://127.0.0.1:4321>。
