import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';

const repliesByPath = vi.fn();

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: { threads: { repliesByPath } },
  }),
}));

import {
  clearThreadFirstPageCache,
  directReplyPageHasMore,
  directRepliesToTree,
  shouldPaintDirectReplies,
  startThreadFirstPage,
  THREAD_REPLY_FIRST_PAGE,
  threadContentPath,
} from '@/lib/thread-first-page';

function reply(postId: string): PostRow {
  return {
    accountId: 'bob.near',
    postId,
    value: '{}',
    blockHeight: 1,
    blockTimestamp: 1,
    receiptId: `r-${postId}`,
    parentPath: 'alice.near/post/root',
    parentAuthor: 'alice.near',
    parentType: 'post',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'post',
    audiences: '',
    groupId: '',
    isGroupContent: false,
  } as PostRow;
}

describe('thread first page', () => {
  beforeEach(() => {
    clearThreadFirstPageCache();
    repliesByPath.mockReset();
  });

  it('paints a cold thread and leaves a cached or paged one alone', () => {
    expect(
      shouldPaintDirectReplies({ fromCache: false, paginated: false })
    ).toBe(true);
    expect(
      shouldPaintDirectReplies({ fromCache: true, paginated: false })
    ).toBe(false);
    expect(
      shouldPaintDirectReplies({ fromCache: false, paginated: true })
    ).toBe(false);
    expect(
      shouldPaintDirectReplies({
        fromCache: false,
        paginated: false,
        directRepliesResolved: true,
      })
    ).toBe(false);
  });

  it('treats a full page as more replies', () => {
    expect(directReplyPageHasMore(THREAD_REPLY_FIRST_PAGE - 1)).toBe(false);
    expect(directReplyPageHasMore(THREAD_REPLY_FIRST_PAGE)).toBe(true);
  });

  it('builds leaf nodes from the direct page', () => {
    const tree = directRepliesToTree([reply('one')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe('bob.near/post/one');
    expect(tree[0]?.replies).toEqual([]);
  });

  it('uses the group content path for a guild post', () => {
    expect(
      threadContentPath({
        accountId: 'alice.near',
        postId: 'p1',
        groupId: 'dao',
      })
    ).toBe('alice.near/groups/dao/content/post/p1');
  });

  it('shares one request across the tap and the sheet', async () => {
    let release: (rows: PostRow[]) => void = () => {};
    repliesByPath.mockImplementation(
      () =>
        new Promise<PostRow[]>((resolve) => {
          release = resolve;
        })
    );
    const first = startThreadFirstPage('alice.near/post/root');
    const second = startThreadFirstPage('alice.near/post/root');
    expect(repliesByPath).toHaveBeenCalledTimes(1);
    release([reply('one')]);
    await expect(first).resolves.toEqual({
      replies: [expect.objectContaining({ postId: 'one' })],
      hasMore: false,
    });
    await expect(second).resolves.toEqual(await first);
    await startThreadFirstPage('alice.near/post/root');
    expect(repliesByPath).toHaveBeenCalledTimes(1);
  });
});
