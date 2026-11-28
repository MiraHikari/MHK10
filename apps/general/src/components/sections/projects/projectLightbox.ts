import type { LightboxItem } from '@/components/effects/Lightbox';
import { formatProjectDate, type Project } from '@/lib/projects/types';

export function createProjectLightboxItems(projects: readonly Project[]): LightboxItem[] {
  return projects.map((project, index) => ({
    imageSrc: project.image ?? '',
    imageAlt: project.title,
    title: project.title,
    location: `PROJECT ${String(index + 1).padStart(2, '0')}`,
    year: formatProjectDate(project.date),
    category: project.tags[0] ?? 'PROJECT',
    description: project.description,
    tags: project.tags,
    link: project.link,
    github: project.github,
  }));
}
