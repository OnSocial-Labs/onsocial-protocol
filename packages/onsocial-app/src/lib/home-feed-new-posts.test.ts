import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  countUnseenFeedPosts,
  feedPostKeySet,
  homeFeedNewPostsLabel,
} from './home-feed-new-posts';

function row(accountId: string, postId: string): PostRow {
  return {
    accountId,
    postId,
    value: '{"text":"hi"}',
    blockHeight: 1,
    blockTimestamp: 1,
    groupId: 'dao',
  };
}

describe('countUnseenFeedPosts', () => {
  it('counts head rows missing from seen keys', () => {
    const seen = feedPostKeySet([row('a.near', '1'), row('b.near', '2')]);
    const head = [row('c.near', '3'), row('a.near', '1'), row('d.near', '4')];
    expect(countUnseenFeedPosts(head, seen)).toBe(2);
  });

  it('returns 0 when head is already loaded', () => {
    const posts = [row('a.near', '1'), row('b.near', '2')];
    expect(countUnseenFeedPosts(posts, feedPostKeySet(posts))).toBe(0);
  });
});

describe('homeFeedNewPostsLabel', () => {
  it('formats singular, plural, and saturated probe', () => {
    expect(homeFeedNewPostsLabel(1)).toBe('1 new post');
    expect(homeFeedNewPostsLabel(3)).toBe('3 new posts');
    expect(homeFeedNewPostsLabel(8)).toBe('8+ new posts');
    expect(homeFeedNewPostsLabel(0)).toBe('');
  });
});
