import type { FriendLink } from '@/data/profile';

export const FRIEND_GROUP_META = {
  close: {
    id: 'close',
    zh: '多年挚友',
    en: 'CLOSE CIRCLE',
    order: 0,
    layout: 'directory',
  },
} as const;

export type KnownFriendGroupId = keyof typeof FRIEND_GROUP_META;

export type FriendGroupMeta = (typeof FRIEND_GROUP_META)[KnownFriendGroupId];

export interface FriendGroupSection {
  readonly meta: FriendGroupMeta;
  readonly links: readonly FriendLink[];
}

export function isKnownFriendGroup(id: string | undefined): id is KnownFriendGroupId {
  return id != null && Object.prototype.hasOwnProperty.call(FRIEND_GROUP_META, id);
}

/** 展示用域名：去 `www.` 前缀；非法 URL 返回 null，由调用方降级展示原文。 */
export function siteHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** 组内排序：addedAt 倒序（缺失视为最早）。同日保持输入顺序（稳定排序）。 */
export function sortFriendsWithinGroup(links: readonly FriendLink[]): FriendLink[] {
  return links.toSorted((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));
}

/** 已知分区分区列表（按 meta.order）；空组不输出。 */
export function friendGroupsForDisplay(links: readonly FriendLink[]): FriendGroupSection[] {
  return Object.values(FRIEND_GROUP_META)
    .toSorted((a, b) => a.order - b.order)
    .map((meta) => ({
      meta,
      links: sortFriendsWithinGroup(links.filter((link) => link.group === meta.id)),
    }))
    .filter((section) => section.links.length > 0);
}

/** 未分组 + 未知 group id → 普通网格。 */
export function ungroupedFriends(links: readonly FriendLink[]): FriendLink[] {
  return sortFriendsWithinGroup(links.filter((link) => !isKnownFriendGroup(link.group)));
}
