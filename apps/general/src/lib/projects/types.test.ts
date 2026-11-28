import { describe, expect, it } from 'vite-plus/test';
import type { Project } from '@/lib/projects/types';
import { formatProjectDate, sortProjectsByDate } from '@/lib/projects/types';

const project = (id: string, date: string, order: number): Project => ({
  id,
  title: id,
  description: id,
  tags: [],
  date,
  featured: false,
  order,
});

describe('project dates', () => {
  it('sorts newest first and uses order as a stable tie-breaker', () => {
    const projects = [
      project('older', '2024-10-03', 1),
      project('newer-b', '2026-07-26', 3),
      project('newer-a', '2026-07-26', 2),
    ];

    expect(sortProjectsByDate(projects).map((entry) => entry.id)).toEqual([
      'newer-a',
      'newer-b',
      'older',
    ]);
  });

  it('formats authored precision without timezone conversion', () => {
    expect(formatProjectDate('2026-07-26')).toBe('2026.07.26');
    expect(formatProjectDate('2026')).toBe('2026');
  });
});
