import shared from '@mhk/site-core/content-model/profile-data';
import type { SkillItem } from '@mhk/site-core/content-model/profile';
import type { ProjectRecord } from '@mhk/site-core/content-model/projects';
import sharedProjects from '@mhk/site-core/content/projects.generated.json';
import templatePresentation from './portfolio-presentation.json';
import { portfolioAsset, portfolioPreview } from './images';

const defaultCategory: Record<string, string> = {
  CORE: 'LANGUAGES',
  FRONTEND: 'WEB',
  BACKEND: 'WEB',
  'DESKTOP & SYSTEM': 'DESKTOP',
  'HARDWARE & EMBEDDED': 'HARDWARE',
  'DATA & AI': 'DATA',
  'TOOLS & PLATFORM': 'INFRASTRUCTURE',
  WEB3: 'ONCHAIN',
};
const copyFor = <T>(copies: Record<string, T>, id: string): T | undefined => copies[id];

/**
 * The owner's gitignored real presentation copy (`src/data/local/`) replaces
 * the tracked template whole-file when present; a clone sees the template.
 * `import.meta.glob` over the optional path stays empty without the file.
 */
const localPresentation = Object.values(
  import.meta.glob<typeof templatePresentation>('./local/portfolio-presentation.json', {
    eager: true,
    import: 'default',
  }),
)[0];
const presentation = localPresentation ?? templatePresentation;

/** Presentation files may change voice, labels and ordering, never an authored fact. */
if (Object.hasOwn(presentation, 'profile')) {
  throw new Error(
    'Author profile copy in the shared profile.json; the desktop presentation cannot override it.',
  );
}
function assertPresentationRecords(
  kind: string,
  records: Record<string, Record<string, unknown>>,
  identities: readonly string[],
  presentationKeys: readonly string[],
): void {
  const known = new Set(identities);
  const allowed = new Set(presentationKeys);
  for (const [identity, record] of Object.entries(records)) {
    if (!known.has(identity)) {
      throw new Error(`Desktop ${kind} presentation names an unknown shared record: ${identity}`);
    }
    const sharedKeys = Object.keys(record).filter((key) => !allowed.has(key));
    if (sharedKeys.length) {
      throw new Error(
        `Desktop ${kind} presentation for ${identity} overrides shared facts: ${sharedKeys.join(', ')}`,
      );
    }
  }
}

assertPresentationRecords(
  'journey',
  presentation.journey,
  shared.aboutJourney.map((item) => item.year),
  ['description'],
);
assertPresentationRecords(
  'principle',
  presentation.principles,
  shared.aboutPrinciples.map((item) => item.title),
  ['icon', 'meaning', 'description'],
);
assertPresentationRecords(
  'experience',
  presentation.experiences,
  shared.experiences.map((item) => item.name),
  ['summary'],
);
assertPresentationRecords(
  'honor',
  presentation.honors,
  shared.honors.map((item) => item.title),
  ['description'],
);
assertPresentationRecords(
  'project',
  presentation.projects,
  sharedProjects.map((item) => item.id),
  ['description', 'summary'],
);

const learningNames = new Set(shared.skillsCurrentlyLearning.map((item) => item.name));
if (presentation.currentLabels.length !== shared.aboutCurrently.length) {
  throw new Error(
    'Desktop current labels must match the shared aboutCurrently records one-for-one.',
  );
}
const unknownLearning = Object.keys(presentation.learningCategories).filter(
  (name) => !learningNames.has(name),
);
if (unknownLearning.length) {
  throw new Error(
    `Desktop learning presentation names unknown shared records: ${unknownLearning.join(', ')}`,
  );
}

const sharedSkillNames = new Set(shared.skills.map((skill) => skill.name));
const projectedSkillNames = presentation.skillCategories.flatMap((group) => group.skills);
const unknownSkills = projectedSkillNames.filter((name) => !sharedSkillNames.has(name));
if (unknownSkills.length) {
  throw new Error(
    `Desktop skill presentation names unknown shared skills: ${unknownSkills.join(', ')}`,
  );
}
const duplicateSkills = projectedSkillNames.filter(
  (name, index) => projectedSkillNames.indexOf(name) !== index,
);
if (duplicateSkills.length) {
  throw new Error(
    `Desktop skill presentation places shared skills twice: ${duplicateSkills.join(', ')}`,
  );
}

const galleryPaths = new Set(shared.galleryItems.map((item) => item.imageSrc));
const unknownFeatured = presentation.featuredPhotoPaths.filter((path) => !galleryPaths.has(path));
if (unknownFeatured.length) {
  throw new Error(
    `Desktop featured pictures are missing from the shared gallery: ${unknownFeatured.join(', ')}`,
  );
}

const categorizedSkills = shared.skills.map((skill) => ({
  ...(skill satisfies SkillItem),
  category:
    presentation.skillCategories.find((group) => group.skills.includes(skill.name))?.id ??
    defaultCategory[skill.category],
}));
if (categorizedSkills.some((skill) => !skill.category)) {
  throw new Error('A shared skill has no desktop category mapping.');
}
const source = {
  profile: shared.profile,
  aboutCurrently: shared.aboutCurrently.map((item, index) => ({
    ...item,
    label: presentation.currentLabels[index] ?? item.label,
  })),
  aboutJourney: shared.aboutJourney.map((item) => ({
    ...item,
    ...copyFor(presentation.journey, item.year),
  })),
  aboutPrinciples: shared.aboutPrinciples.map((item) => ({
    ...item,
    icon: 'doc',
    meaning: '',
    ...copyFor(presentation.principles, item.title),
  })),
  education: shared.education,
  experiences: shared.experiences.map((item) => ({
    ...item,
    ...copyFor(presentation.experiences, item.name),
  })),
  certificates: shared.certificates,
  languages: shared.languages,
  skillCategories: presentation.skillCategories,
  skills: presentation.skillCategories.flatMap((group) => {
    const order = new Map(group.skills.map((name, index) => [name, index]));
    return categorizedSkills
      .filter((skill) => skill.category === group.id)
      .sort(
        (left, right) => (order.get(left.name) ?? Infinity) - (order.get(right.name) ?? Infinity),
      );
  }),
  skillsCurrentlyLearning: shared.skillsCurrentlyLearning.map((item) => ({
    ...item,
    category: copyFor(presentation.learningCategories, item.name) ?? defaultCategory[item.category],
  })),
  honors: shared.honors.map((item) => ({
    ...item,
    ...copyFor(presentation.honors, item.title),
  })),
  friendLinks: shared.friendLinks,
  gallery: shared.galleryItems,
  featuredPhotoPaths: presentation.featuredPhotoPaths,
};

/** Desktop presentation over the shared authored records; no second factual source. */
export const portfolio = source;
export { portfolioAsset, portfolioPreview };
export const profile = {
  name: source.profile.name,
  role: source.profile.heroLine,
  summary: source.profile.summary,
  // Both presentations read the same approved profile copy from the shared source.
  introduction: source.profile.introduction,
  detail: source.profile.detail,
  location: source.profile.location,
  specialties: source.profile.specialties,
  avatar: portfolioAsset(source.profile.avatar),
  avatarAlt: source.profile.avatarAlt,
  email: source.profile.email,
  website: source.profile.website,
  github: source.profile.github,
  bilibili: source.profile.bilibili,
} as const;
const skillIcons: Record<string, string> = {
  LANGUAGES: 'code',
  WEB: 'display',
  DESKTOP: 'chip',
  HARDWARE: 'tools',
  DATA: 'database',
  INFRASTRUCTURE: 'network',
  ONCHAIN: 'cube',
  AGENTS: 'exe',
};
export const skillGroups = source.skillCategories.map((category) => ({
  id: category.id,
  icon: skillIcons[category.id] ?? 'tools',
  title: category.label,
  description: category.description,
  items: source.skills.filter((skill) => skill.category === category.id).map((skill) => skill.name),
  skills: source.skills.filter((skill) => skill.category === category.id),
}));
const projectRecords = sharedProjects satisfies readonly ProjectRecord[];
export const projects = projectRecords
  .filter((project) => project.active !== false)
  .map((project) => ({
    ...project,
    ...copyFor(presentation.projects, project.id),
    summary: copyFor(presentation.projects, project.id)?.summary ?? project.description,
    href: project.link,
    preview: portfolioAsset(project.image),
  }));
export const portfolioPhotos = source.gallery
  .filter((photo) => source.featuredPhotoPaths.includes(photo.imageSrc))
  .map((photo) => ({
    ...photo,
    imageSrc: portfolioAsset(photo.imageSrc),
    preview: portfolioPreview(photo.imageSrc),
  }));

/** Editorial paths through existing, owner-authored records; each link names a real project. */
export const profileGuides = [
  {
    id: 'web',
    label: 'Web & open source',
    title: '把页面背后的系统也连接起来',
    description:
      '从 2021 年入门 Web，到尝试 Node.js 接口和数据，再到开源邮箱与线上解谜活动，我逐步把页面、服务和部署接成完整的产品。',
    icon: 'code',
    projectIds: ['cloudflare-vmail', 'riddle-town-hunt'],
  },
  {
    id: 'devices',
    label: 'Desktop & devices',
    title: '让软件走出浏览器',
    description:
      'Rust 和 Tauri 把工具带到桌面；在学校社团的硬件原型里，我又把界面与设备、传感器和 MQTT 通信连接起来。',
    icon: 'chip',
    projectIds: ['nearlink-toolbox', 'water-cleaning-usv', 'daka'],
  },
  {
    id: 'experiments',
    label: 'Experiments & stories',
    title: '和队友把想法做成可操作的原型',
    description:
      '在 AdventureX 2026 的五天里，我们把自然语言问卷、方案组合和测试网支付连成 xEngine。我也用照片和文章记录这段过程。',
    icon: 'doc',
    projectIds: ['xengine'],
  },
].map(({ projectIds, ...guide }) => ({
  ...guide,
  projects: projectIds.map((id) => {
    const project = projects.find((entry) => entry.id === id);
    if (!project) throw new Error(`Unknown project in profile guide: ${id}`);
    return { id: project.id, title: project.title };
  }),
}));
