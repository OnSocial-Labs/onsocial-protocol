import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  countUnseenFeedPosts,
  feedPostKeySet,
  homeFeedNewPostsLabel,
  pendingFeedOffsetShift,
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

  it('ignores foreign replies that the home feed would hide', () => {
    const seen = feedPostKeySet([row('bob.near', 'root')]);
    const head: PostRow[] = [
      {
        accountId: 'alice.near',
        postId: 'reply',
        value: '{"text":"hi"}',
        blockHeight: 2,
        blockTimestamp: 2,
        parentPath: 'bob.near/post/root',
        parentAuthor: 'bob.near',
      },
      row('bob.near', 'root'),
    ];
    expect(countUnseenFeedPosts(head, seen)).toBe(0);
    expect(
      countUnseenFeedPosts(head, seen, { includeForeignReplies: true })
    ).toBe(1);
  });

  it('ignores the viewer own posts at the head', () => {
    const seen = feedPostKeySet([
      row('alice.near', 'root'),
      row('bob.near', 'other'),
    ]);
    const head = [row('alice.near', 'new'), row('bob.near', 'other')];
    expect(countUnseenFeedPosts(head, seen)).toBe(1);
    expect(
      countUnseenFeedPosts(head, seen, { viewerAccountId: 'alice.near' })
    ).toBe(0);
    expect(
      countUnseenFeedPosts(head, seen, { viewerAccountId: 'bob.near' })
    ).toBe(1);
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

describe('pendingFeedOffsetShift', () => {
  it('shifts chrono pages by the unapplied unseen count', () => {
    expect(
      pendingFeedOffsetShift({
        newPostCount: 3,
        appliedShift: 0,
        chronoPaged: true,
      })
    ).toBe(3);
    expect(
      pendingFeedOffsetShift({
        newPostCount: 3,
        appliedShift: 3,
        chronoPaged: true,
      })
    ).toBe(0);
    expect(
      pendingFeedOffsetShift({
        newPostCount: 5,
        appliedShift: 3,
        chronoPaged: true,
      })
    ).toBe(2);
  });

  it('never shifts hot-paged feeds or goes negative', () => {
    expect(
      pendingFeedOffsetShift({
        newPostCount: 3,
        appliedShift: 0,
        chronoPaged: false,
      })
    ).toBe(0);
    expect(
      pendingFeedOffsetShift({
        newPostCount: 1,
        appliedShift: 4,
        chronoPaged: true,
      })
    ).toBe(0);
  });
});
