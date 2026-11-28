# Giscus 评论配置说明

本站评论使用 [Giscus](https://giscus.app/zh-CN)，挂在公开仓库
`MiraHikari/blog-comments` 的 Discussions 上，仓库已安装 giscus GitHub App。

## 当前配置（已生效）

- 公共配置在 `packages/site-core/src/config/giscus.ts`，包含仓库 ID、会话 key 与
  `GISCUS_WIDGET_DEFAULTS`；桌面 Reader 的评论窗口也读取同一配置与 URL 构建器，
  两端不再各自维护参数。`isGiscusConfigured()` 为 `true`。
- 两端统一使用 `mapping="specific"`、`lang="zh-CN"`，`strict` 关闭；`emitMetadata`
  保持开启，让评论窗口拿到 discussion 链接与就绪状态。通用版使用共享的
  `transparent_dark` 主题，桌面版继续注入随主题变化的本地 CSS。`term` 为文章
  slug：每篇文章对应一个独立 Discussion，评论与文章一一对应。
- 页面由 `src/components/blog/GiscusComments.tsx` 挂载，评论区异步加载，
  不阻塞正文渲染。

## 友链申请评论区

friends 章节（/friends）同样挂载 `GiscusComments`，`mapping="specific"`、
`term` 固定为 `friends-links`。由于 Announcements 分类仅维护者可创建
Discussion，上线前必须在 `MiraHikari/blog-comments` 仓库**手动预建**标题为
`friends-links` 的 Discussion，否则首位访客留言会因无法自动建楼而失败。

## 可选：origins 白名单

如需限制评论框架可嵌入的域名，可在仓库根目录新建 `giscus.json`：

```json
{
  "origins": ["https://www.example.com"]
}
```

参考：<https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md#giscusjson>

## 故障排查

- **iframe 空白 / 评论不加载**：确认 `repoId` / `categoryId` 与
  `MiraHikari/blog-comments` 一致，且该仓库已安装 giscus App。
- **国内访问慢**：giscus.app 托管于 Vercel，评论区异步加载，不阻塞正文渲染；
  如仍需要可考虑自托管 giscus 或使用 CDN 加速。
- **评论未按文章隔离**：确认 `mapping="specific"`、`term` 传入的是文章 slug。
