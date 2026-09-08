import type {
  GroupMemberRow,
  GroupStats,
  JoinRequest,
  PostRow,
} from '@onsocial/sdk';
import type { GuildConfigSnapshot } from '@/features/guilds/guild-config';
import type { GuildPageData } from '@/lib/load-guild-page';
import {
  writeGuildFeedCache,
  writeGuildPageCache,
  type GuildPageCacheEntry,
} from '@/lib/guild-page-cache';
import { writeGuildShellCache } from '@/lib/guild-shell-cache';

export type GuildPageLoadState = 'loading' | 'ready' | 'missing' | 'error';
export type GuildFeedFilterId = 'all' | string;

export const GUILD_FEED_LOAD_MORE_ERROR = 'Could not load more posts.';

export function guildFeedLoadMoreError(cause: unknown): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : GUILD_FEED_LOAD_MORE_ERROR;
}

export interface ViewerGuildState {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  isBlacklisted: boolean;
  joinRequest: JoinRequest | null;
  pendingJoinProposalId: string | null;
}

export interface LiveGuildModerationState {
  pendingMemberRequestCount: number;
  activeProposalCount: number;
}

export interface LiveGuildState {
  config: GuildConfigSnapshot | null;
  stats: GroupStats | null;
  indexedMemberCount: number | null;
  postCount: number | null;
  members: GroupMemberRow[];
  posts: PostRow[];
  feedError: string | null;
  viewer: ViewerGuildState | null;
  moderation: LiveGuildModerationState | null;
}

export function pendingJoinRequest(request: JoinRequest | null): boolean {
  return request?.status === 'pending';
}

export function persistGuildPageCache(
  groupId: string,
  entry: GuildPageCacheEntry,
  feed?: { filterId: string; posts: PostRow[]; hasMore: boolean }
) {
  writeGuildShellCache(groupId, entry.shell);
  writeGuildPageCache(groupId, entry);
  if (feed) {
    writeGuildFeedCache(groupId, feed.filterId, {
      posts: feed.posts,
      hasMore: feed.hasMore,
    });
  }
}

export function pageCacheFromInitial(
  initial: GuildPageData
): GuildPageCacheEntry {
  return {
    config: initial.config,
    shell: initial.shell,
    stats: initial.stats,
    indexedMemberCount: initial.indexedMemberCount,
    members: initial.members,
    postCount: initial.postCount,
    structureResolved: initial.structureResolved,
  };
}

export function emptyLiveGuildState(): LiveGuildState {
  return {
    config: null,
    stats: null,
    indexedMemberCount: null,
    postCount: null,
    members: [],
    posts: [],
    feedError: null,
    viewer: null,
    moderation: null,
  };
}

export function liveGuildStateFromSeed(input: {
  config: GuildConfigSnapshot | null;
  stats: GroupStats | null;
  indexedMemberCount: number | null;
  postCount: number | null;
  members: GroupMemberRow[];
  posts: PostRow[];
}): LiveGuildState {
  return {
    config: input.config,
    stats: input.stats,
    indexedMemberCount: input.indexedMemberCount,
    postCount: input.postCount,
    members: input.members,
    posts: input.posts,
    feedError: null,
    viewer: null,
    moderation: null,
  };
}
