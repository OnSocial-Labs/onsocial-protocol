import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { postContentPath } from '@onsocial/sdk';
import {
  insertOptimisticFeedPost,
  personalFeedBlockIsPollRow,
  shouldPrependOptimisticFeedPost,
} from './personal-feed-list';
import {
  FEED_WINDOW_POLL_ESTIMATE_PX,
  feedWindowRowEstimatePx,
} from './feed-window';

function row(accountId: string, postId: string, parentPath?: string): PostRow {
  return {
    accountId,
    postId,
    value: '{"text":"hi"}',
    blockHeight: 1,
    blockTimestamp: 1,
    groupId: 'dao',
    ...(parentPath ? { parentPath, parentAuthor: accountId } : {}),
  };
}

describe('shouldPrependOptimisticFeedPost', () => {
  it('keeps guild roots off Pulse and allows replies', () => {
    expect(shouldPrependOptimisticFeedPost(row('alice.near', 'root'))).toBe(
      false
    );
    expect(
      shouldPrependOptimisticFeedPost({
        ...row('alice.near', 'reply'),
        parentPath: 'bob.near/post/root',
        parentAuthor: 'bob.near',
      })
    ).toBe(true);
    expect(
      shouldPrependOptimisticFeedPost({
        accountId: 'alice.near',
        postId: 'hello',
        value: '{"text":"hi"}',
        blockHeight: 1,
        blockTimestamp: 1,
      })
    ).toBe(true);
  });
});

describe('insertOptimisticFeedPost', () => {
  it('prepends a self-reply to the feed head even when its parent is on-page', () => {
    const parent = row('alice.near', 'root');
    const posts = [
      row('bob.near', 'other'),
      parent,
      row('carol.near', 'older'),
    ];
    const reply: PostRow = {
      ...row('alice.near', 'reply'),
      parentPath: postContentPath(parent),
      parentAuthor: 'alice.near',
    };

    const next = insertOptimisticFeedPost(posts, reply);

    expect(next.map((post) => post.postId)).toEqual([
      'reply',
      'root',
      'other',
      'older',
    ]);
  });

  it('prepends when the parent is not on the page', () => {
    const posts = [row('bob.near', 'other')];
    const reply = row('alice.near', 'reply', 'alice.near/post/missing');

    const next = insertOptimisticFeedPost(posts, reply);

    expect(next.map((post) => post.postId)).toEqual(['reply', 'other']);
  });

  it('does not duplicate an already-listed post', () => {
    const posts = [row('bob.near', 'other')];
    const again = row('bob.near', 'other');

    const next = insertOptimisticFeedPost(posts, again);

    expect(next.map((post) => post.postId)).toEqual(['other']);
  });

  it('injects a parent snapshot when the original is off-page', () => {
    const parent = row('alice.near', 'root');
    const posts = [row('bob.near', 'other')];
    const reply: PostRow = {
      ...row('alice.near', 'reply'),
      parentPath: postContentPath(parent),
      parentAuthor: 'alice.near',
    };

    const next = insertOptimisticFeedPost(posts, reply, parent);

    expect(next.map((post) => post.postId)).toEqual(['reply', 'root', 'other']);
  });

  it('promotes the original even if the reply was already prepended', () => {
    const parent = row('alice.near', 'root');
    const reply: PostRow = {
      ...row('alice.near', 'reply'),
      parentPath: postContentPath(parent),
      parentAuthor: 'alice.near',
    };
    const posts = [reply, row('bob.near', 'other'), parent];

    const next = insertOptimisticFeedPost(posts, reply, parent);

    expect(next.map((post) => post.postId)).toEqual(['reply', 'root', 'other']);
  });

  it('promotes a stranger parent with a viewer reply', () => {
    const parent = row('bob.near', 'root');
    const posts = [row('carol.near', 'newer'), parent];
    const reply: PostRow = {
      ...row('alice.near', 'reply'),
      parentPath: postContentPath(parent),
      parentAuthor: 'bob.near',
    };

    const next = insertOptimisticFeedPost(posts, reply);

    expect(next.map((post) => post.postId)).toEqual(['reply', 'root', 'newer']);
  });
});

function pollValue(question: string): string {
  return JSON.stringify({
    text: question,
    embeds: [{ kind: 'poll', question, options: ['Red', 'Blue'] }],
  });
}

describe('personalFeedBlockIsPollRow', () => {
  it('estimates a single poll card, including a bare repost of one', () => {
    const poll: PostRow = {
      ...row('alice.near', 'poll'),
      kind: 'poll',
      value: pollValue('Favorite color?'),
    };
    expect(personalFeedBlockIsPollRow({ posts: [poll] }, {})).toBe(true);
    expect(feedWindowRowEstimatePx(true)).toBe(FEED_WINDOW_POLL_ESTIMATE_PX);

    const shell: PostRow = {
      ...row('bob.near', 'share'),
      refType: 'repost',
      refPath: 'alice.near/post/poll',
      value: '',
    };
    expect(
      personalFeedBlockIsPollRow(
        { posts: [shell] },
        {
          'alice.near/post/poll': poll,
        }
      )
    ).toBe(true);
    expect(personalFeedBlockIsPollRow({ posts: [shell] }, {})).toBe(false);
  });

  it('keeps threads and media rows on the generic estimate', () => {
    const poll: PostRow = {
      ...row('alice.near', 'poll'),
      value: pollValue('Favorite color?'),
    };
    const reply = row('alice.near', 'reply');
    expect(personalFeedBlockIsPollRow({ posts: [poll, reply] }, {})).toBe(
      false
    );
    const withPhoto: PostRow = {
      ...poll,
      value: JSON.stringify({
        text: 'Favorite color?',
        media: ['https://example.test/a.jpg'],
        embeds: [
          {
            kind: 'poll',
            question: 'Favorite color?',
            options: ['Red', 'Blue'],
          },
        ],
      }),
    };
    expect(personalFeedBlockIsPollRow({ posts: [withPhoto] }, {})).toBe(false);
    expect(
      personalFeedBlockIsPollRow({ posts: [poll], standingPeek: reply }, {})
    ).toBe(false);
  });
});
