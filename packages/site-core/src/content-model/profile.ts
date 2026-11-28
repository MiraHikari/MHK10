export type HonorTier = 'national' | 'provincial' | 'city';
export type HonorKind = 'competition' | 'industry';

export interface HonorItem {
  readonly title: string;
  readonly issuer: string;
  readonly issuerShort?: string;
  readonly date: string;
  readonly level: string;
  readonly description: string;
  readonly tier: HonorTier;
  readonly kind?: HonorKind;
  readonly highlight?: boolean;
  readonly imageSrc?: string;
  readonly downloadSrc?: string;
  readonly imageAlt?: string;
  readonly sourceUrl?: string;
  readonly sourceLabel?: string;
}

export type GalleryDatePrecision = 'year' | 'month' | 'date' | 'datetime';

export interface GalleryItem {
  readonly title: string;
  readonly location: string;
  readonly year: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly datePrecision: GalleryDatePrecision;
  readonly order: number;
  readonly category: string;
  readonly imageSrc: string;
  readonly downloadSrc?: string;
  readonly imageAlt: string;
  readonly width: number;
  readonly height: number;
}

export interface SkillItem {
  readonly name: string;
  readonly level: number;
  readonly category: string;
  readonly years?: number;
  readonly note?: string;
  readonly icon?: string; // iconify 名称,如 'simple-icons:typescript' 或 'lucide:cpu'
  readonly keywords?: readonly string[]; // 搜索别名
}

export interface SkillCategoryMeta {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface JourneyEntry {
  readonly year: string;
  readonly title: string;
  readonly description: string;
}

export interface PrincipleItem {
  readonly title: string;
  readonly greek?: string;
  readonly zh?: string;
  readonly description: string;
}

export interface CurrentlyItem {
  readonly label: string;
  readonly value: string;
}

export interface EducationItem {
  readonly institution: string;
  readonly area: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly current?: boolean;
}

export interface ExperienceItem {
  readonly name: string;
  readonly position: string;
  readonly location: string;
  readonly url?: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly current?: boolean;
  readonly summary: string;
  readonly highlights: readonly string[];
  readonly stack: readonly string[];
}

export interface CertificateItem {
  readonly name: string;
  readonly issuer: string;
  readonly date: string;
}

export interface LanguageItem {
  readonly language: string;
  readonly fluency: string;
}

export interface FriendLink {
  readonly name: string;
  readonly url: string;
  readonly description: string;
  /** 命名分组 id；未填 = 普通友链。目前仅识别 `close`。 */
  readonly group?: string;
  /** 显式 favicon：/images/ 站内路径或完整外链；留空自动抓取 <origin>/favicon.ico。 */
  readonly favicon?: string;
  /** 收录日期 YYYY-MM-DD，同组内新的在前。 */
  readonly addedAt?: string;
}

export interface BeianInfo {
  readonly icp: string;
  readonly police: string;
}
