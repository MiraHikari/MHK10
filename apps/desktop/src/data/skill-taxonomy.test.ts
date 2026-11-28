import { describe, expect, it } from 'vite-plus/test';
import shared from '@mhk/site-core/content-model/profile-data';
import { portfolio, skillGroups } from './profile';

describe('skill taxonomy', () => {
  it('lists every shared technology once in the presentation group order', () => {
    const names = skillGroups.flatMap((group) => group.items);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(shared.skills.map((skill) => skill.name).sort());
    expect(skillGroups.map((group) => group.id)).toEqual(
      portfolio.skillCategories.map((group) => group.id),
    );
    for (const group of skillGroups) expect(group.items.length).toBeGreaterThan(0);
  });

  it('maps every learning subject into a real group', () => {
    const ids = new Set<string>(skillGroups.map((group) => group.id));
    expect(portfolio.skillsCurrentlyLearning.map((item) => item.name).sort()).toEqual(
      shared.skillsCurrentlyLearning.map((item) => item.name).sort(),
    );
    for (const item of portfolio.skillsCurrentlyLearning) expect(ids.has(item.category)).toBe(true);
  });
});
