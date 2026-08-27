import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { postContentPath } from '@onsocial/sdk';
import { insertOptimisticFeedPost } from './personal-feed-list';

function row(
  accountId: string,
  postId: string,
  parentPath?: string
): PostRow {
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

describe('insertOptimisticFeedPost', () => {
  it('splices a self-reply before its on-page parent instead of prepending', () => {
    const parent = row('alice.near', 'root');
    const posts = [row('bob.near', 'other'), parent, row('carol.near', 'older')];
    const reply: PostRow = {
      ...row('alice.near', 'reply'),
      parentPath: postContentPath(parent),
      parentAuthor: 'alice.near',
    };

    const next = insertOptimisticFeedPost(posts, reply);

    expect(next.map((post) => post.postId)).toEqual([
      'other',
      'reply',
      'root',
      'older',
    ]);
  });

  it('prepends when the parent is not on the page', () => {
    const posts = [row('bob.near', 'other')];
    const reply = row('alice.near', 'reply', 'alice.near/post/missing');

    const next = insertOptimisticFeedPost(posts, reply);

    expect(next.map((post) => post.postId)).toEqual(['reply', 'other']);
  });
});
