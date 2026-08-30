import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';
import type { ThreadReplyRow } from '@/lib/thread-display';
import { sortThreadReplyRows } from './thread-reply-sort';

function post(
  accountId: string,
  postId: string,
  blockTimestamp: number
): PostRow {
  return { accountId, postId, value: '', blockHeight: 0, blockTimestamp };
}

function row(
  accountId: string,
  postId: string,
  blockTimestamp: number
): ThreadReplyRow {
  return {
    kind: 'post',
    post: post(accountId, postId, blockTimestamp),
    connectedToPrevious: false,
  };
}

describe('sortThreadReplyRows', () => {
  const rows: ThreadReplyRow[] = [
    row('a.near', 'p1', 100),
    { kind: 'more', branchKey: 'x', hiddenCount: 2 },
    row('b.near', 'p2', 300),
    row('c.near', 'p3', 200),
  ];

  it('keeps tree rows untouched when relevant', () => {
    expect(sortThreadReplyRows(rows, 'relevant', {})).toBe(rows);
  });

  it('flattens newest-first when recent, dropping fold rows', () => {
    const sorted = sortThreadReplyRows(rows, 'recent', {});
    expect(
      sorted.map((r) => (r.kind === 'post' ? r.post.postId : 'more'))
    ).toEqual(['p2', 'p3', 'p1']);
    expect(sorted.every((r) => r.kind === 'post')).toBe(true);
  });

  it('ranks by engagement when trending, newest breaks ties', () => {
    const engagement = {
      [postKey(post('a.near', 'p1', 100))]: {
        replyCount: 0,
        quoteCount: 0,
        repostCount: 0,
        reactionCount: 9,
        viewerReacted: false,
        amplifyCount: 0,
        viewerAmplified: false,
        viewerSaved: false,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
      },
    };
    const sorted = sortThreadReplyRows(rows, 'trending', engagement);
    expect(
      sorted.map((r) => (r.kind === 'post' ? r.post.postId : 'more'))
    ).toEqual(['p1', 'p2', 'p3']);
  });
});
