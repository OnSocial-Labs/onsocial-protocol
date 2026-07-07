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

    expect(coalesceFeedThreads([a, b])).toEqual([[a], [b]]);
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
    expect(coalesceFeedThreads([reply, parent])).toEqual([[parent, reply]]);
  });

  it('hides cross-author replies from the feed', () => {
    const parent = post({ postId: 'root', accountId: 'bob.near' });
    const reply = post({
      postId: 'r1',
      parentPath: parentPathFor('bob.near', 'root'),
      parentAuthor: 'bob.near',
    });

    // The reply lives on bob's thread page; the feed keeps only his post.
    expect(coalesceFeedThreads([reply, parent])).toEqual([[parent]]);
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
      [bobsPost],
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
      [parent, reply],
      [other],
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

    expect(coalesceFeedThreads([c, b, a])).toEqual([[a, b, c]]);
  });

  it('keeps a self-reply alone when the parent is not on this page', () => {
    const reply = post({
      postId: 'r1',
      parentPath: parentPathFor('alice.near', 'off-page'),
      parentAuthor: 'alice.near',
    });

    expect(coalesceFeedThreads([reply])).toEqual([[reply]]);
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
      [parent, newer],
      [older],
    ]);
  });
});
