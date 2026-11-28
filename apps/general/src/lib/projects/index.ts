import { getCollection } from 'astro:content';
import { sortProjectsByDate, type Project } from './types';

export async function getActiveProjects(): Promise<Project[]> {
  const projects = await getCollection('projects');

  return sortProjectsByDate(
    projects
      .filter((project) => project.data.active)
      .map((project) => ({ id: project.id, ...project.data })),
  );
}
