import type { ProjectRecord } from '@mhk/site-core/content-model/projects';
export type Project = Omit<ProjectRecord, 'active' | 'highlights'> &
  Partial<Pick<ProjectRecord, 'active' | 'highlights'>>;

export function projectTimestamp(date: string): number {
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function formatProjectDate(date: string): string {
  return date.replaceAll('-', '.');
}

export function sortProjectsByDate(projects: readonly Project[]): Project[] {
  return projects.toSorted((a, b) => {
    const dateDelta = projectTimestamp(b.date) - projectTimestamp(a.date);
    return dateDelta || a.order - b.order;
  });
}
