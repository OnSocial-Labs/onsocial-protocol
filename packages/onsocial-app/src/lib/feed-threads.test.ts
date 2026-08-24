import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { coalesceFeedThreads } from './feed-threads';

function post(overrides: Partial<PostRow> & Pick<PostRow, 'postId'>): PostRow {
  return {
    accountId: 'alice.near',
    value: '{"text":"hi"}',
    blockHeight: 1,
    blockTimestamp: 1,
    groupId: 'dao',
    ...overrides,
  };
}

const parentPathFor = (author: string, postId: string) =>
  `${author}/groups/dao/content/post/${postId}`;

describe('coalesceFeedThreads', () => {
  it('keeps unrelated posts as single blocks', () => {
    const a = post({ postId: 'a' });
    const b = post({ postId: 'b', accountId: 'bob.near' });

    expect(coalesceFeedThreads([a, b])).toEqual([
      { posts: [a] },
      { posts: [b] },
    ]);
  });

  it('joins a self-reply with its parent, parent first', () => {
    const parent = post({ postId: 'root', blockTimestamp: 1 });
    const reply = post({
      postId: 'r1',
      blockTimestamp: 2,
      parentPath: parentPathFor('alice.near', 'root'),
      parentAuthor: 'alice.near',
    });

    // Newest-first feed: reply appears before its parent.
    expect(coalesceFeedThreads([reply, parent])).toEqual([
      { posts: [parent, reply] },
    ]);
  });

  it('hides cross-author replies from the feed', () => {
    const parent = post({ postId: 'root', accountId: 'bob.near' });
    const reply = post({
      postId: 'r1',
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });

    // The reply lives on bob's thread page; the feed keeps only his post.
    expect(coalesceFeedThreads([reply, parent])).toEqual([
      { posts: [parent] },
    ]);
  });

  it('keeps cross-author replies when includeForeignReplies is set', () => {
    const parent = post({ postId: 'root', accountId: 'bob.near' });
    const reply = post({
      postId: 'r1',
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });

    expect(
      coalesceFeedThreads([reply, parent], { includeForeignReplies: true })
    ).toEqual([{ posts: [reply] }, { posts: [parent] }]);
  });

  it('tucks a stood-with reply under the parent post', () => {
    const parent = post({ postId: 'root', accountId: 'bob.near' });
    const reply = post({
      postId: 'r1',
      accountId: 'alice.near',
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });

    expect(
      coalesceFeedThreads([reply, parent], {
        stoodWithAccountIds: new Set(['alice.near']),
      })
    ).toEqual([{ posts: [parent], standingPeek: reply }]);
  });

  it('shows only the newest stood-with reply with a coil tail for longer chains', () => {
    const bobsPost = post({ postId: 'root', accountId: 'bob.near' });
    const aliceReply = post({
      postId: 'r1',
      accountId: 'alice.near',
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });
    const aliceFollowUp = post({
      postId: 'r2',
      accountId: 'alice.near',
      blockTimestamp: 3,
      parentPath: parentPathFor('alice.near', 'r1'),
      parentAuthor: 'alice.near',
    });

    expect(
      coalesceFeedThreads([aliceFollowUp, aliceReply, bobsPost], {
        stoodWithAccountIds: new Set(['alice.near']),
      })
    ).toEqual([
      {
        posts: [bobsPost],
        standingPeek: aliceFollowUp,
        standingCoilTail: true,
      },
    ]);
  });

  it('keeps the newest stood-with reply when several accounts reply to one parent', () => {
    const parent = post({
      postId: 'root',
      accountId: 'bob.near',
      blockTimestamp: 1,
    });
    const aliceReply = post({
      postId: 'alice-r',
      accountId: 'alice.near',
      blockTimestamp: 2,
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });
    const carolReply = post({
      postId: 'carol-r',
      accountId: 'carol.near',
      blockTimestamp: 4,
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });
    const daveReply = post({
      postId: 'dave-r',
      accountId: 'dave.near',
      blockTimestamp: 3,
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });

    expect(
      coalesceFeedThreads([carolReply, daveReply, aliceReply, parent], {
        stoodWithAccountIds: new Set([
          'alice.near',
          'carol.near',
          'dave.near',
        ]),
      })
    ).toEqual([{ posts: [parent], standingPeek: carolReply }]);
  });

  it('keeps stood-with peek outside a long native self-thread chain', () => {
    const root = post({ postId: 'root', blockTimestamp: 1 });
    const r2 = post({
      postId: 'r2',
      blockTimestamp: 2,
      parentPath: parentPathFor('alice.near', 'root'),
      parentAuthor: 'alice.near',
    });
    const r3 = post({
      postId: 'r3',
      blockTimestamp: 3,
      parentPath: parentPathFor('alice.near', 'r2'),
      parentAuthor: 'alice.near',
    });
    const r4 = post({
      postId: 'r4',
      blockTimestamp: 4,
      parentPath: parentPathFor('alice.near', 'r3'),
      parentAuthor: 'alice.near',
    });
    const r5 = post({
      postId: 'r5',
      blockTimestamp: 5,
      parentPath: parentPathFor('alice.near', 'r4'),
      parentAuthor: 'alice.near',
    });
    const bobReply = post({
      postId: 'bob-r',
      accountId: 'bob.near',
      blockTimestamp: 6,
      parentPath: parentPathFor('alice.near', 'root'),
      parentAuthor: 'alice.near',
    });

    expect(
      coalesceFeedThreads([bobReply, r5, r4, r3, r2, root], {
        stoodWithAccountIds: new Set(['bob.near']),
      })
    ).toEqual([
      {
        posts: [root, r2, r3, r4, r5],
        standingPeek: bobReply,
      },
    ]);
  });

  it('hides a self-thread rooted in a reply to someone else', () => {
    const bobsPost = post({ postId: 'root', accountId: 'bob.near' });
    const aliceReply = post({
      postId: 'r1',
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });
    const aliceFollowUp = post({
      postId: 'r2',
      parentPath: parentPathFor('alice.near', 'r1'),
      parentAuthor: 'alice.near',
    });

    expect(coalesceFeedThreads([aliceFollowUp, aliceReply, bobsPost])).toEqual([
      { posts: [bobsPost] },
    ]);
  });

  it('anchors the block at the newest member position', () => {
    const other = post({ postId: 'x', accountId: 'bob.near' });
    const parent = post({ postId: 'root' });
    const reply = post({
      postId: 'r1',
      parentPath: parentPathFor('alice.near', 'root'),
      parentAuthor: 'alice.near',
    });

    expect(coalesceFeedThreads([reply, other, parent])).toEqual([
      { posts: [parent, reply] },
      { posts: [other] },
    ]);
  });

  it('walks multi-level self-thread chains', () => {
    const a = post({ postId: 'a' });
    const b = post({
      postId: 'b',
      parentPath: parentPathFor('alice.near', 'a'),
      parentAuthor: 'alice.near',
    });
    const c = post({
      postId: 'c',
      parentPath: parentPathFor('alice.near', 'b'),
      parentAuthor: 'alice.near',
    });

    expect(coalesceFeedThreads([c, b, a])).toEqual([{ posts: [a, b, c] }]);
  });

  it('keeps a self-reply alone when the parent is not on this page', () => {
    const reply = post({
      postId: 'r1',
      parentPath: parentPathFor('alice.near', 'off-page'),
      parentAuthor: 'alice.near',
    });

    expect(coalesceFeedThreads([reply])).toEqual([{ posts: [reply] }]);
  });

  it('gives the parent to the newest sibling only', () => {
    const parent = post({ postId: 'root' });
    const newer = post({
      postId: 'r2',
      parentPath: parentPathFor('alice.near', 'root'),
      parentAuthor: 'alice.near',
    });
    const older = post({
      postId: 'r1',
      parentPath: parentPathFor('alice.near', 'root'),
      parentAuthor: 'alice.near',
    });

    expect(coalesceFeedThreads([newer, older, parent])).toEqual([
      { posts: [parent, newer] },
      { posts: [older] },
    ]);
  });
});
