import { describe, expect, it } from 'vitest';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { postKey } from '@/features/home/post-card';
import { buildReplyRows, leafThreadNode } from '@/lib/thread-display';
import {
  graftConfirmedReply,
  paintedReplyPosts,
  withConfirmedLocalReplyRows,
} from '@/lib/thread-confirmed-reply';

function post(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    value: `{"v":1,"text":"${postId}"}`,
    blockHeight: 1,
    blockTimestamp: 1,
    ...extra,
  };
}

describe('graftConfirmedReply', () => {
  const rootPath = 'alice.near/post/root';

  it('inserts a root-targeted reply as a top-level node', () => {
    const reply = post('dave.near', 'r1', {
      parentPath: rootPath,
      parentAuthor: 'alice.near',
    });
    const next = graftConfirmedReply([], reply, rootPath);
    expect(next).toHaveLength(1);
    expect(postKey(next[0]!.post)).toBe(postKey(reply));
  });

  it('grafts a nested reply under its painted parent', () => {
    const bob = post('bob.near', 'reply-one');
    const tree: ThreadNode[] = [
      leafThreadNode(bob, 'bob.near/post/reply-one'),
    ];
    const nested = post('dave.near', 'nested', {
      parentPath: 'bob.near/post/reply-one',
      parentAuthor: 'bob.near',
    });
    const next = graftConfirmedReply(tree, nested, rootPath);
    expect(next[0]!.replies).toHaveLength(1);
    expect(postKey(next[0]!.replies[0]!.post)).toBe(postKey(nested));
  });
});

describe('withConfirmedLocalReplyRows', () => {
  const rootPath = 'alice.near/post/root';

  it('splices a nested local under its painted parent', () => {
    const bob = post('bob.near', 'reply-one');
    const rows = buildReplyRows(
      [leafThreadNode(bob, 'bob.near/post/reply-one')],
      'alice.near'
    );
    const nested = post('dave.near', 'nested', {
      parentPath: 'bob.near/post/reply-one',
      parentAuthor: 'bob.near',
      blockHeight: 0,
    });
    const next = withConfirmedLocalReplyRows(rows, [nested], [], rootPath);
    expect(next.map((row) => (row.kind === 'post' ? row.post.postId : 'more')))
      .toEqual(['reply-one', 'nested']);
    expect(next[1]).toMatchObject({
      kind: 'post',
      connectedToPrevious: true,
    });
  });

  it('keeps nested locals when the fold model would hide them in the tree', () => {
    const bob = post('bob.near', 'reply-one');
    const nested = post('dave.near', 'nested', {
      parentPath: 'bob.near/post/reply-one',
      parentAuthor: 'bob.near',
      blockHeight: 0,
    });
    const tree = graftConfirmedReply(
      [leafThreadNode(bob, 'bob.near/post/reply-one')],
      nested,
      rootPath
    );
    const rows = buildReplyRows(tree, 'alice.near');
    // Fold model paints Bob only — Dave is in the tree but not in rows.
    expect(paintedReplyPosts(rows).map((p) => p.postId)).toEqual(['reply-one']);
    const next = withConfirmedLocalReplyRows(rows, [nested], paintedReplyPosts(rows), rootPath);
    expect(next.some((row) => row.kind === 'post' && row.post.postId === 'nested')).toBe(
      true
    );
  });
});
