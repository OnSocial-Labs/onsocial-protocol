import { describe, expect, it } from 'vitest';
import type { GuildPageData } from '@/lib/load-guild-page';
import {
  emptyLiveGuildState,
  liveGuildStateFromSeed,
  pageCacheFromInitial,
  pendingJoinRequest,
} from '@/features/guilds/guild-page-data';

const initialPage = {
  groupId: 'audit-guild',
  config: { name: 'Audit Guild' },
  shell: { name: 'Audit Guild' },
  stats: { memberCount: 3 },
  indexedMemberCount: 4,
  members: [{ memberId: 'alice.near' }],
  postCount: 7,
  posts: [{ postId: '1' }],
  hasMorePosts: true,
  structureResolved: true,
} as unknown as GuildPageData;

describe('pendingJoinRequest', () => {
  it('is true only for pending join requests', () => {
    expect(pendingJoinRequest(null)).toBe(false);
    expect(pendingJoinRequest({ status: 'approved' } as never)).toBe(false);
    expect(pendingJoinRequest({ status: 'pending' } as never)).toBe(true);
  });
});

describe('pageCacheFromInitial', () => {
  it('copies SSR shell fields and structureResolved', () => {
    expect(pageCacheFromInitial(initialPage)).toEqual({
      config: initialPage.config,
      shell: initialPage.shell,
      stats: initialPage.stats,
      indexedMemberCount: 4,
      members: initialPage.members,
      postCount: 7,
      structureResolved: true,
    });
  });
});

describe('liveGuildStateFromSeed', () => {
  it('starts viewer and feed error empty so ACL can resolve', () => {
    expect(
      liveGuildStateFromSeed({
        config: initialPage.config,
        stats: initialPage.stats,
        indexedMemberCount: 4,
        postCount: 7,
        members: initialPage.members,
        posts: initialPage.posts,
      })
    ).toEqual({
      config: initialPage.config,
      stats: initialPage.stats,
      indexedMemberCount: 4,
      postCount: 7,
      members: initialPage.members,
      posts: initialPage.posts,
      feedError: null,
      viewer: null,
      moderation: null,
    });
  });
});

describe('emptyLiveGuildState', () => {
  it('clears the painted page when the guild is missing', () => {
    expect(emptyLiveGuildState()).toEqual({
      config: null,
      stats: null,
      indexedMemberCount: null,
      postCount: null,
      members: [],
      posts: [],
      feedError: null,
      viewer: null,
      moderation: null,
    });
  });
});
