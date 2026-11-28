/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** 图片 CDN 基座地址（对象存储只读加速域名），如 https://static.example.com */
  readonly PUBLIC_IMAGE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
