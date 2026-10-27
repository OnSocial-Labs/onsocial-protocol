import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';
import { threadReplyRowKey, type ThreadReplyRow } from './thread-display';

function post(accountId: string, postId: string): PostRow {
  return { accountId, postId, value: '', blockHeight: 0, blockTimestamp: 0 };
}

describe('threadReplyRowKey', () => {
  it('keys post rows by postKey', () => {
    const row: ThreadReplyRow = {
      kind: 'post',
      post: post('a.near', 'p1'),
      connectedToPrevious: false,
    };
    expect(threadReplyRowKey(row)).toBe(postKey(row.post));
    expect(threadReplyRowKey(row)).toBe('a.near:p1');
  });

  it('keys fold rows by branch so they never collide with a post key', () => {
    const row: ThreadReplyRow = {
      kind: 'more',
      branchKey: 'a.near:p1',
      hiddenCount: 3,
      hidden: [],
    };
    expect(threadReplyRowKey(row)).toBe('more-a.near:p1');
    expect(threadReplyRowKey(row)).not.toBe(postKey(post('a.near', 'p1')));
  });
});
