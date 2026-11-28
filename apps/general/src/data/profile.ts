import type {
  HonorTier,
  HonorItem,
  GalleryItem,
  SkillItem,
  SkillCategoryMeta,
  JourneyEntry,
  PrincipleItem,
  CurrentlyItem,
  EducationItem,
  ExperienceItem,
  CertificateItem,
  LanguageItem,
  FriendLink,
  BeianInfo,
} from '@mhk/site-core/content-model/profile';
export type {
  HonorTier,
  HonorKind,
  HonorItem,
  GalleryDatePrecision,
  GalleryItem,
  SkillItem,
  SkillCategoryMeta,
  JourneyEntry,
  PrincipleItem,
  CurrentlyItem,
  EducationItem,
  ExperienceItem,
  CertificateItem,
  LanguageItem,
  FriendLink,
  BeianInfo,
} from '@mhk/site-core/content-model/profile';

import data from '@mhk/site-core/content-model/profile-data';
import { friendGroupsForDisplay, ungroupedFriends } from '@/lib/friends';

export const BIRTHDAY = data.birthday;

export function getAge(birthday: string = BIRTHDAY): number {
  const birth = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export const profile = {
  ...data.profile,
  birthday: BIRTHDAY,
  age: getAge(),
};

export const aboutCurrently: readonly CurrentlyItem[] = data.aboutCurrently;

export const aboutJourney: readonly JourneyEntry[] = data.aboutJourney;

export const aboutPrinciples: readonly PrincipleItem[] = data.aboutPrinciples;

export const education: readonly EducationItem[] = data.education;

export const experiences: readonly ExperienceItem[] = data.experiences;

export const certificates: readonly CertificateItem[] = data.certificates;

export const languages: readonly LanguageItem[] = data.languages;

export const beian: BeianInfo = data.beian;

export const skillCategories: readonly SkillCategoryMeta[] = data.skillCategories;

export const skills: readonly SkillItem[] = data.skills;

export const skillsCurrentlyLearning: readonly SkillItem[] = data.skillsCurrentlyLearning;

export const skillsQuote = data.skillsQuote;

export const honors: readonly HonorItem[] = data.honors as HonorItem[];

export const honorTierMeta: Readonly<
  Record<HonorTier, { label: string; zh: string; accent: string; rank: number }>
> = data.honorTierMeta as Readonly<
  Record<HonorTier, { label: string; zh: string; accent: string; rank: number }>
>;

// Derived from `honors` so the AWARDS strip can never drift from the list.
export const honorStats = [
  { value: honors.length, label: '奖项总数', suffix: '' },
  {
    value: honors.filter((honor) => honor.tier === 'national').length,
    label: '国家级',
    suffix: '',
  },
  {
    value: honors.filter((honor) => honor.tier === 'provincial').length,
    label: '省级',
    suffix: '',
  },
  { value: honors.filter((honor) => honor.tier === 'city').length, label: '市级', suffix: '' },
] as const;

// Derived from the shared journey start year and the skills/honors arrays.
const developmentStartYear = aboutJourney.reduce((earliest, entry) => {
  const year = Number.parseInt(entry.year, 10);
  return Number.isFinite(year) ? Math.min(earliest, year) : earliest;
}, new Date().getFullYear());

export const aboutStats = [
  { value: getAge(), label: '年龄', suffix: '岁' },
  { value: new Date().getFullYear() - developmentStartYear, label: '年开发', suffix: '+' },
  { value: honors.length, label: '获奖', suffix: '' },
  { value: Math.floor(skills.length / 10) * 10, label: '技术栈', suffix: '+' },
];

export const galleryItems: readonly GalleryItem[] = data.galleryItems as GalleryItem[];

export const friendLinks: readonly FriendLink[] = data.friendLinks as FriendLink[];

export const groupedFriendSections = friendGroupsForDisplay(friendLinks);
export const regularFriends: readonly FriendLink[] = ungroupedFriends(friendLinks);
