import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { FeedWindowSizeCache } from '@/features/home/feed-window';
import {
  profilePostsAfterMemoryTrim,
  retainProfileTextSectionHeights,
  type ProfileFeedBlockKeyStates,
} from '@/features/home/profile-feed-client';
import { postKey } from '@/lib/post-display';
import {
  GUILD_FEED_HEIGHT_CACHE_MAX,
  guildFeedHeightSlotKey,
  rememberGuildFeedHeightSlot,
  retainFeedWindowHeights,
  type GuildFeedHeightSlot,
} from '@/lib/feed-window-height-retain';

function row(postId: string, extra: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId,
    blockHeight: 1,
    blockTimestamp: 1,
    value: JSON.stringify({ text: postId }),
    ...extra,
  };
}

const emptySectionKeys = (): ProfileFeedBlockKeyStates => ({
  posts: [],
  replies: [],
  reposts: [],
});

describe('profile text-section height retain', () => {
  it('drops trimmed keys and keeps active and inactive section heights across a tab return', () => {
    const cache = new FeedWindowSizeCache();
    const postsKeep = row('posts-keep');
    const postsDrop = row('posts-drop');
    const replyKeep = row('reply-keep', {
      parentPath: 'bob.near/post/parent',
      parentAuthor: 'bob.near',
    });
    cache.set(postKey(postsKeep), 210);
    cache.set(postKey(postsDrop), 180);
    cache.set(postKey(replyKeep), 160);

    const current = [postsKeep, postsDrop, replyKeep];
    const visible = [postsKeep, postsDrop];
    const trimmed = [postsKeep];
    const surviving = profilePostsAfterMemoryTrim(
      current,
      visible,
      trimmed,
      'posts'
    );

    const afterPosts = retainProfileTextSectionHeights(
      cache,
      surviving,
      'posts',
      emptySectionKeys()
    );
    expect(cache.get(postKey(postsDrop))).toBeUndefined();
    expect(cache.get(postKey(postsKeep))).toBe(210);
    expect(cache.get(postKey(replyKeep))).toBe(160);

    const afterReplies = retainProfileTextSectionHeights(
      cache,
      surviving,
      'replies',
      afterPosts
    );
    retainProfileTextSectionHeights(cache, surviving, 'posts', afterReplies);
    expect(cache.get(postKey(postsKeep))).toBe(210);
    expect(cache.get(postKey(replyKeep))).toBe(160);
    expect(cache.get(postKey(postsDrop))).toBeUndefined();
  });
});

describe('guild room height caches', () => {
  it('keeps room A across a switch to B and trims only A', () => {
    const slots = new Map<string, GuildFeedHeightSlot>();
    const roomA = guildFeedHeightSlotKey('social.guild', 'general');
    const roomB = guildFeedHeightSlotKey('social.guild', 'decisions');
    const keep = row('a-keep');
    const drop = row('a-drop');
    const otherRoom = row('b-keep');

    const slotA = rememberGuildFeedHeightSlot(slots, roomA);
    slotA.cache.set(postKey(keep), 100);
    slotA.cache.set(postKey(drop), 80);
    const slotB = rememberGuildFeedHeightSlot(slots, roomB);
    slotB.cache.set(postKey(otherRoom), 50);

    const back = rememberGuildFeedHeightSlot(slots, roomA);
    expect(back).toBe(slotA);
    expect(back.cache.get(postKey(keep))).toBe(100);
    expect(back.cache.get(postKey(drop))).toBe(80);

    const [nextKeys] = retainFeedWindowHeights(back.cache, [
      { posts: [keep], previous: back.blockKeys },
    ]);
    back.blockKeys = nextKeys ?? [];
    expect(back.cache.get(postKey(drop))).toBeUndefined();
    expect(back.cache.get(postKey(keep))).toBe(100);
    expect(slotB.cache.get(postKey(otherRoom))).toBe(50);
  });

  it('bounds room slots and refreshes the hot room', () => {
    const slots = new Map<string, GuildFeedHeightSlot>();
    const max = GUILD_FEED_HEIGHT_CACHE_MAX;
    for (let i = 0; i < max + 1; i += 1) {
      rememberGuildFeedHeightSlot(slots, `room-${i}`);
    }
    expect(slots.has('room-0')).toBe(false);
    expect(slots.has(`room-${max}`)).toBe(true);

    const hot = new Map<string, GuildFeedHeightSlot>();
    rememberGuildFeedHeightSlot(hot, 'hot');
    for (let i = 0; i < max; i += 1) {
      rememberGuildFeedHeightSlot(hot, 'hot');
      rememberGuildFeedHeightSlot(hot, `cold-${i}`);
    }
    expect(hot.has('hot')).toBe(true);
    expect(hot.has('cold-0')).toBe(false);
  });
});
