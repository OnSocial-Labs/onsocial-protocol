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
  enrichPaintedReplyTree,
  graftVisibleReplies,
  invalidateThreadFirstPage,
  invalidateThreadOpenCaches,
  quoteLoadMoreCursor,
  replyLoadMoreCursor,
  reposterLoadMoreCursor,
  scheduleThreadIdle,
  shouldPaintDirectReplies,
  shouldReplacePaginatedList,
  startThreadFirstPage,
  THREAD_REPLY_FIRST_PAGE,
  threadContentPath,
} from '@/lib/thread-first-page';
import { leafThreadNode } from '@/lib/thread-display';

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

  it('keeps load-mored quotes/reposters across soft refresh', () => {
    expect(
      shouldReplacePaginatedList({ background: true, paginated: true })
    ).toBe(false);
    expect(
      shouldReplacePaginatedList({ background: true, paginated: false })
    ).toBe(true);
    expect(
      shouldReplacePaginatedList({ background: false, paginated: true })
    ).toBe(true);
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

  it('grafts one child under a direct reply and leaves a walked branch alone', () => {
    const leaves = directRepliesToTree([reply('one')]);
    const line = { ...reply('line'), parentPath: 'bob.near/post/one' };
    const grafted = graftVisibleReplies(leaves, [
      line,
      { ...reply('second'), parentPath: 'bob.near/post/one' },
    ]);
    expect(grafted[0]?.replies).toHaveLength(1);
    expect(grafted[0]?.replies[0]?.post.postId).toBe('line');

    const walked = graftVisibleReplies(grafted, [
      { ...reply('later'), parentPath: 'bob.near/post/one' },
    ]);
    expect(walked[0]?.replies[0]?.post.postId).toBe('line');
  });

  it('enriches painted directs with walked children without reshuffling', () => {
    const painted = directRepliesToTree([reply('one'), reply('two')]);
    const nested = { ...reply('nested'), parentPath: 'bob.near/post/one' };
    const walked = [
      { ...painted[1]!, replies: [] },
      {
        ...painted[0]!,
        replies: [leafThreadNode(nested, 'bob.near/post/nested')],
      },
    ];
    const next = enrichPaintedReplyTree(painted, walked);
    expect(next.map((node) => node.post.postId)).toEqual(['one', 'two']);
    expect(next[0]?.replies[0]?.post.postId).toBe('nested');
    expect(next[1]?.replies).toEqual([]);
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

  it('refetches after invalidate drops the settled page', async () => {
    repliesByPath.mockResolvedValue([reply('one')]);
    await startThreadFirstPage('alice.near/post/root');
    expect(repliesByPath).toHaveBeenCalledTimes(1);
    invalidateThreadFirstPage('alice.near/post/root');
    await startThreadFirstPage('alice.near/post/root');
    expect(repliesByPath).toHaveBeenCalledTimes(2);
    invalidateThreadOpenCaches('alice.near/post/root');
    await startThreadFirstPage('alice.near/post/root');
    expect(repliesByPath).toHaveBeenCalledTimes(3);
  });
});

describe('replyLoadMoreCursor', () => {
  it('prefers the last confirmed block height', () => {
    expect(
      replyLoadMoreCursor([
        { ...reply('a'), blockHeight: 10 },
        { ...reply('b'), blockHeight: 20 },
        { ...reply('c'), blockHeight: 0 },
      ])
    ).toEqual({ afterBlockHeight: 20 });
  });

  it('falls back to offset when only optimistic rows exist', () => {
    expect(
      replyLoadMoreCursor([
        { ...reply('a'), blockHeight: 0 },
        { ...reply('b'), blockHeight: 0 },
      ])
    ).toEqual({ offset: 2 });
    expect(replyLoadMoreCursor([])).toEqual({ offset: 0 });
  });
});

describe('quoteLoadMoreCursor / reposterLoadMoreCursor', () => {
  it('pages descending quotes older than the last painted height', () => {
    expect(
      quoteLoadMoreCursor([
        { ...reply('q1'), blockHeight: 50 },
        { ...reply('q2'), blockHeight: 40 },
      ])
    ).toEqual({ beforeBlockHeight: 40 });
  });

  it('pages descending reposters older than the last timestamp', () => {
    expect(
      reposterLoadMoreCursor([
        { blockTimestamp: 90 },
        { blockTimestamp: 80 },
        { blockTimestamp: 0 },
      ])
    ).toEqual({ beforeBlockTimestamp: 80 });
    expect(reposterLoadMoreCursor([])).toEqual({ offset: 0 });
  });
});

describe('scheduleThreadIdle', () => {
  it('runs immediately in non-browser environments', () => {
    const run = vi.fn();
    const stop = scheduleThreadIdle(run, 1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(() => stop()).not.toThrow();
  });
});
