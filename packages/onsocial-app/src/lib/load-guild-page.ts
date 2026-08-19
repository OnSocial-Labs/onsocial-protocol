import { cache } from 'react';
import type { GroupMemberRow, GroupStats, PostRow } from '@onsocial/sdk';
import type { GuildConfigSnapshot } from '@/features/guilds/guild-config';
import { guildConfigFromIndexedRow } from '@/features/guilds/guild-facts';
import { reconcileGuildMemberRoster } from '@/features/guilds/guild-member-roster';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';
import type { GuildShellCacheEntry } from '@/lib/guild-shell-cache';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type GuildPageData = {
  config: GuildConfigSnapshot;
  shell: GuildShellCacheEntry;
  posts: PostRow[];
  hasMorePosts: boolean;
  stats: GroupStats | null;
  /** Indexer member aggregate — preferred for first paint over RPC stats. */
  indexedMemberCount: number | null;
  members: GroupMemberRow[];
  postCount: number | null;
  /** False when structure is the default placeholder (RPC not loaded yet). */
  structureResolved: boolean;
  engagement: PostEngagementMap;
  scarceEmbeds: PostScarceEmbedMap;
};

/** SSR guild shell + first feed page from indexer (viewer/ACL still client). */
export const loadGuildPageData = cache(
  async (groupId: string): Promise<GuildPageData | null> => {
    const id = groupId.trim();
    if (!id) return null;
    try {
      const os = createServerOnSocialClient();
      const [indexed] = await os.query.groups.byIds([id]);
      if (!indexed) return null;

      const config = guildConfigFromIndexedRow(id, indexed);
      const shell: GuildShellCacheEntry = {
        name: config.name,
        bannerUrl: config.bannerUrl,
        accessGated: config.accessGated,
        memberDriven: config.memberDriven,
        description: config.description,
        topics: config.topics,
      };

      const [feedResult, membersResult, countResult, postCountResult] =
        await Promise.allSettled([
          os.query.groups.feed({ groupId: id, limit: 20 }),
          os.query.groups.membersOf(id, { limit: 8 }),
          os.query.groups.memberCountsFor([id]),
          os.query.groups.postCountFor(id),
        ]);

      const feed =
        feedResult.status === 'fulfilled' ? feedResult.value : { items: [] };
      const members =
        membersResult.status === 'fulfilled'
          ? reconcileGuildMemberRoster(
              membersResult.value.items ?? [],
              config.ownerId
            )
          : [];
      const indexedMemberCount =
        countResult.status === 'fulfilled'
          ? (countResult.value.get(id) ?? null)
          : null;
      const posts = feed.items ?? [];
      const [engagement, scarceEmbeds] = await Promise.all([
        loadPostEngagementMap(os, posts),
        hydrateScarceEmbedsForPosts(os, posts),
      ]);

      return {
        config,
        shell,
        posts,
        hasMorePosts: feed.nextOffset !== undefined,
        stats: null,
        indexedMemberCount,
        members,
        postCount:
          postCountResult.status === 'fulfilled'
            ? postCountResult.value
            : null,
        structureResolved: false,
        engagement,
        scarceEmbeds,
      };
    } catch {
      return null;
    }
  }
);
