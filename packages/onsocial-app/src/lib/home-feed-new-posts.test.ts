import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  countUnseenFeedPosts,
  EMPTY_UNSEEN_FEED_SUMMARY,
  feedPostKeySet,
  homeFeedNewPostsCountLabel,
  homeFeedNewPostsLabel,
  mergeHomeFeedHead,
  pendingFeedOffsetShift,
  summarizeUnseenFeedPosts,
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

function parentPathFor(accountId: string, postId: string): string {
  return `${accountId}/groups/dao/content/post/${postId}`;
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
        parentPath: parentPathFor('bob.near', 'root'),
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

  it('counts a stood-with reply as one Pulse card', () => {
    const parent = row('bob.near', 'root');
    const reply: PostRow = {
      accountId: 'alice.near',
      postId: 'reply',
      value: '{"text":"hi"}',
      blockHeight: 2,
      blockTimestamp: 2,
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    };
    const stoodWith = new Set(['alice.near']);

    expect(
      countUnseenFeedPosts([reply, parent], feedPostKeySet([parent]), {
        stoodWithAccountIds: stoodWith,
      })
    ).toBe(1);

    expect(
      summarizeUnseenFeedPosts([reply, parent], new Set(), {
        stoodWithAccountIds: stoodWith,
      })
    ).toEqual({ count: 1, authorIds: ['alice.near'] });
  });

  it('does not chip the viewer own reply to a stranger', () => {
    const parent = row('bob.near', 'root');
    const reply: PostRow = {
      accountId: 'me.near',
      postId: 'reply',
      value: '{"text":"hi"}',
      blockHeight: 2,
      blockTimestamp: 2,
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    };

    expect(
      countUnseenFeedPosts([reply, parent], new Set(), {
        stoodWithAccountIds: new Set(['me.near', 'carol.near']),
        viewerAccountId: 'me.near',
      })
    ).toBe(0);
  });

  it('counts an orphan stood-with reply when the parent is off the head', () => {
    const reply: PostRow = {
      accountId: 'alice.near',
      postId: 'reply',
      value: '{"text":"hi"}',
      blockHeight: 2,
      blockTimestamp: 2,
      parentPath: parentPathFor('bob.near', 'missing'),
      parentAuthor: 'bob.near',
    };

    expect(
      summarizeUnseenFeedPosts([reply], new Set(), {
        stoodWithAccountIds: new Set(['alice.near']),
      })
    ).toEqual({ count: 1, authorIds: ['alice.near'] });
  });
});

describe('summarizeUnseenFeedPosts', () => {
  it('returns unique authors in head order capped at three', () => {
    const seen = feedPostKeySet([row('z.near', 'old')]);
    const head = [
      row('a.near', '1'),
      row('a.near', '2'),
      row('b.near', '3'),
      row('c.near', '4'),
      row('d.near', '5'),
    ];
    expect(summarizeUnseenFeedPosts(head, seen)).toEqual({
      count: 5,
      authorIds: ['a.near', 'b.near', 'c.near'],
    });
  });

  it('shares EMPTY_UNSEEN_FEED_SUMMARY shape for clears', () => {
    expect(EMPTY_UNSEEN_FEED_SUMMARY).toEqual({ count: 0, authorIds: [] });
  });
});

describe('homeFeedNewPostsCountLabel', () => {
  it('formats compact chip counts', () => {
    expect(homeFeedNewPostsCountLabel(1)).toBe('1');
    expect(homeFeedNewPostsCountLabel(3)).toBe('3');
    expect(homeFeedNewPostsCountLabel(4)).toBe('3+');
    expect(homeFeedNewPostsCountLabel(8)).toBe('3+');
    expect(homeFeedNewPostsCountLabel(0)).toBe('');
  });
});

describe('homeFeedNewPostsLabel', () => {
  it('formats singular, plural, and saturated probe for a11y', () => {
    expect(homeFeedNewPostsLabel(1)).toBe('1 posted');
    expect(homeFeedNewPostsLabel(3)).toBe('3 posted');
    expect(homeFeedNewPostsLabel(8)).toBe('8+ posted');
    expect(homeFeedNewPostsLabel(0)).toBe('');
  });
});

describe('mergeHomeFeedHead', () => {
  it('prepends only new keys and keeps the loaded tail order', () => {
    const loaded = [
      row('a.near', 'old-0'),
      row('b.near', 'old-1'),
      row('c.near', 'july'),
    ];
    const page0 = [
      row('d.near', 'new-0'),
      row('a.near', 'old-0'),
      row('b.near', 'old-1'),
    ];
    const merged = mergeHomeFeedHead(loaded, page0);
    expect(merged.insertedCount).toBe(1);
    expect(merged.posts.map((post) => post.postId)).toEqual([
      'new-0',
      'old-0',
      'old-1',
      'july',
    ]);
  });

  it('does not drop a loaded page when page-0 is a full refresh', () => {
    const loaded = [
      row('a.near', '1'),
      row('b.near', '2'),
      row('c.near', '3'),
      row('d.near', 'july'),
    ];
    const page0 = [row('a.near', '1'), row('b.near', '2'), row('c.near', '3')];
    const merged = mergeHomeFeedHead(loaded, page0);
    expect(merged.insertedCount).toBe(0);
    expect(merged.posts.map((post) => post.postId)).toEqual([
      '1',
      '2',
      '3',
      'july',
    ]);
  });

  it('counts a new root plus its reply as one card', () => {
    const parent = row('bob.near', 'july');
    const reply: PostRow = {
      accountId: 'bob.near',
      postId: 'note',
      value: '{"text":"reply"}',
      blockHeight: 2,
      blockTimestamp: 2,
      parentPath: parentPathFor('bob.near', 'july'),
      parentAuthor: 'bob.near',
    };
    const loaded = [row('a.near', 'older')];
    const merged = mergeHomeFeedHead(loaded, [parent, reply]);
    expect(merged.insertedCount).toBe(1);
    expect(merged.posts.map((post) => post.postId)).toEqual([
      'july',
      'note',
      'older',
    ]);
  });

  it('patches overlapping rows in place without moving them', () => {
    const loaded = [
      { ...row('a.near', 'keep'), amplifyHeat: 1 },
      row('b.near', 'july'),
    ];
    const page0 = [{ ...row('a.near', 'keep'), amplifyHeat: 9 }];
    const merged = mergeHomeFeedHead(loaded, page0);
    expect(merged.insertedCount).toBe(0);
    expect(merged.posts[0]?.amplifyHeat).toBe(9);
    expect(merged.posts[1]?.postId).toBe('july');
  });

  it('keeps an already-loaded parent in place when a new reply lands', () => {
    const parent = row('bob.near', 'july');
    const reply: PostRow = {
      accountId: 'bob.near',
      postId: 'note',
      value: '{"text":"reply"}',
      blockHeight: 2,
      blockTimestamp: 2,
      parentPath: parentPathFor('bob.near', 'july'),
      parentAuthor: 'bob.near',
    };
    const loaded = [row('a.near', 'newer'), parent, row('c.near', 'older')];
    const merged = mergeHomeFeedHead(loaded, [reply, parent]);
    expect(merged.insertedCount).toBe(1);
    expect(merged.posts.map((post) => post.postId)).toEqual([
      'note',
      'newer',
      'july',
      'older',
    ]);
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
