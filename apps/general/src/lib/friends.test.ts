import { describe, expect, it } from 'vite-plus/test';
import {
  friendGroupsForDisplay,
  siteHostname,
  sortFriendsWithinGroup,
  ungroupedFriends,
} from '@/lib/friends';
import type { FriendLink } from '@/data/profile';

const link = (overrides: Partial<FriendLink>): FriendLink => ({
  name: 'Example',
  url: 'https://example.com',
  description: 'demo',
  ...overrides,
});

describe('siteHostname', () => {
  it('strips the www prefix', () => {
    expect(siteHostname('https://www.example.com/path')).toBe('example.com');
  });

  it('keeps non-www hosts including subdomains', () => {
    expect(siteHostname('https://blog.example.com')).toBe('blog.example.com');
  });

  it('returns null for invalid urls', () => {
    expect(siteHostname('not-a-url')).toBeNull();
  });
});

describe('sortFriendsWithinGroup', () => {
  it('sorts addedAt desc and treats missing as oldest', () => {
    const sorted = sortFriendsWithinGroup([
      link({ name: 'a', addedAt: '2026-01-01' }),
      link({ name: 'b' }),
      link({ name: 'c', addedAt: '2026-06-01' }),
    ]);
    expect(sorted.map((l) => l.name)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the input immutable and preserves same-date order', () => {
    const input = [
      link({ name: 'x', addedAt: '2026-08-05' }),
      link({ name: 'y', addedAt: '2026-08-05' }),
    ];
    const sorted = sortFriendsWithinGroup(input);
    expect(sorted.map((l) => l.name)).toEqual(['x', 'y']);
    expect(input.map((l) => l.name)).toEqual(['x', 'y']);
  });
});

describe('friendGroupsForDisplay / ungroupedFriends', () => {
  it('emits known groups in meta.order and sorts within each group', () => {
    const sections = friendGroupsForDisplay([
      link({ name: 'r1' }),
      link({ name: 'c1', group: 'close', addedAt: '2026-01-01' }),
      link({ name: 'c2', group: 'close', addedAt: '2026-06-01' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].meta.id).toBe('close');
    expect(sections[0].meta.zh).toBe('多年挚友');
    expect(sections[0].meta.layout).toBe('directory');
    expect(sections[0].links.map((l) => l.name)).toEqual(['c2', 'c1']);
  });

  it('puts unknown group ids into ungrouped alongside missing group', () => {
    const links = [
      link({ name: 'u', group: 'mystery', addedAt: '2026-02-01' }),
      link({ name: 'n', addedAt: '2026-03-01' }),
      link({ name: 'c', group: 'close' }),
    ];
    expect(ungroupedFriends(links).map((l) => l.name)).toEqual(['n', 'u']);
    expect(friendGroupsForDisplay(links)[0].links.map((l) => l.name)).toEqual(['c']);
  });
});
