/**
 * 灯箱共享类型：`LightboxItem` 对外契约与 YARL slide 增强声明。
 * 独立成模块以打破 Lightbox 壳 ↔ lightbox/root 装配层的类型级循环导入。
 */

export interface LightboxItem {
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly title: string;
  readonly location: string;
  readonly year: string;
  readonly dateLabel?: string;
  readonly category: string;
  readonly downloadSrc?: string;
  readonly sourceUrl?: string;
  readonly sourceLabel?: string;
  /** 展示图像素宽度（可选，供 YARL 预估布局与缩放上限）。 */
  readonly width?: number;
  /** 展示图像素高度（可选）。 */
  readonly height?: number;
  /** Optional long-form description (used by project lightbox). */
  readonly description?: string;
  /** Optional tag list (used by project lightbox). */
  readonly tags?: readonly string[];
  /** Optional external link (used by project lightbox). */
  readonly link?: string;
  /** Optional GitHub repository URL (used by project lightbox). */
  readonly github?: string;
}

declare module 'yet-another-react-lightbox' {
  interface SlideImage {
    /** 原始灯箱条目（自定义 chrome 读取标题 / 位置 / 下载地址等）。 */
    item?: LightboxItem;
  }
  /** 项目详情卡片 slide（project 变体）。 */
  interface ProjectCardSlide extends GenericSlide {
    type: 'project-card';
    item: LightboxItem;
    /** 卡片在列表中的序号（计数器展示用）。 */
    position: number;
    total: number;
  }
  interface SlideTypes {
    'project-card': ProjectCardSlide;
  }
}
