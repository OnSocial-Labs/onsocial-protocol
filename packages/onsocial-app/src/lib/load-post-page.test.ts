import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { THREAD_REPLY_FIRST_PAGE } from '@/lib/thread-first-page';

const mocks = vi.hoisted(() => ({
  repliesByPath: vi.fn(),
  visibleReplies: vi.fn(),
  treeByPath: vi.fn(),
  quotes: vi.fn(),
  fetchPersonalPost: vi.fn(),
  groupsPost: vi.fn(),
  groupsQuotes: vi.fn(),
  groupsThread: vi.fn(),
  groupsThreadTree: vi.fn(),
  groupsByIds: vi.fn(),
  loadPostEngagementMap: vi.fn(async () => ({})),
  hydrateScarceEmbedsForPosts: vi.fn(async () => ({})),
}));

vi.mock('@/lib/create-server-onsocial-client', () => ({
  createServerOnSocialClient: () => ({
    query: {
      threads: {
        repliesByPath: mocks.repliesByPath,
        visibleReplies: mocks.visibleReplies,
        treeByPath: mocks.treeByPath,
        quotes: mocks.quotes,
      },
      groups: {
        post: mocks.groupsPost,
        quotes: mocks.groupsQuotes,
        thread: mocks.groupsThread,
        threadTree: mocks.groupsThreadTree,
        byIds: mocks.groupsByIds,
      },
    },
  }),
}));

vi.mock('@/lib/fetch-personal-post', () => ({
  fetchPersonalPost: mocks.fetchPersonalPost,
}));

vi.mock('@/lib/feed-paint-hydrate', () => ({
  loadPostEngagementMap: mocks.loadPostEngagementMap,
  hydrateScarceEmbedsForPosts: mocks.hydrateScarceEmbedsForPosts,
}));

import { loadGuildPostPageData } from '@/lib/load-guild-post-page';
import { loadPersonalPostPageData } from '@/lib/load-personal-post-page';

function post(postId: string, extra: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'bob.near',
    postId,
    value: '{}',
    blockHeight: 1,
    blockTimestamp: 1,
    ...extra,
  };
}

describe('permalink first page', () => {
  beforeEach(() => {
    mocks.repliesByPath.mockReset();
    mocks.visibleReplies.mockReset();
    mocks.visibleReplies.mockResolvedValue([]);
    mocks.treeByPath.mockReset();
    mocks.quotes.mockReset();
    mocks.fetchPersonalPost.mockReset();
    mocks.groupsPost.mockReset();
    mocks.groupsQuotes.mockReset();
    mocks.groupsThread.mockReset();
    mocks.groupsThreadTree.mockReset();
    mocks.groupsByIds.mockReset();
    mocks.loadPostEngagementMap.mockClear();
    mocks.hydrateScarceEmbedsForPosts.mockClear();
    mocks.quotes.mockResolvedValue([]);
    mocks.groupsQuotes.mockResolvedValue([]);
    mocks.groupsByIds.mockResolvedValue([
      {
        groupName: ' Audit Guild ',
        isMemberDriven: true,
        isPublic: false,
      },
    ]);
  });

  it('sends a personal post with the direct replies that fit', async () => {
    mocks.fetchPersonalPost.mockResolvedValue(
      post('root', { accountId: 'alice.near' })
    );
    mocks.repliesByPath.mockResolvedValue([post('one')]);
    mocks.visibleReplies.mockResolvedValue([
      post('line', {
        accountId: 'alice.near',
        parentPath: 'bob.near/post/one',
      }),
    ]);

    const page = await loadPersonalPostPageData('alice.near', 'personal-fit');

    expect(mocks.repliesByPath).toHaveBeenCalledWith(
      'alice.near/post/personal-fit',
      { limit: THREAD_REPLY_FIRST_PAGE }
    );
    expect(mocks.treeByPath).not.toHaveBeenCalled();
    expect(page?.replies.map((row) => row.postId)).toEqual(['one']);
    expect(page?.replyTree[0]?.path).toBe('bob.near/post/one');
    expect(page?.replyTree[0]?.replies[0]?.post.postId).toBe('line');
    expect(mocks.visibleReplies).toHaveBeenCalledWith(['bob.near/post/one']);
    expect(page?.hasMoreReplies).toBe(false);
    expect(page?.directRepliesResolved).toBe(true);
    expect(mocks.loadPostEngagementMap).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ postId: 'one' })])
    );
  });

  it('marks a full personal page as having more replies', async () => {
    mocks.fetchPersonalPost.mockResolvedValue(post('root'));
    mocks.repliesByPath.mockResolvedValue(
      Array.from({ length: THREAD_REPLY_FIRST_PAGE }, (_, index) =>
        post(`r${index}`)
      )
    );

    const page = await loadPersonalPostPageData('alice.near', 'personal-full');

    expect(page?.hasMoreReplies).toBe(true);
    expect(page?.directRepliesResolved).toBe(true);
  });

  it('keeps a failed personal reply query unresolved', async () => {
    mocks.fetchPersonalPost.mockResolvedValue(post('root'));
    mocks.repliesByPath.mockRejectedValue(new Error('indexer'));

    const page = await loadPersonalPostPageData('alice.near', 'personal-fail');

    expect(page?.replies).toEqual([]);
    expect(page?.directRepliesResolved).toBe(false);
    expect(page?.root.postId).toBe('root');
    expect(mocks.visibleReplies).not.toHaveBeenCalled();
  });

  it('sends a guild post with the direct replies that fit', async () => {
    mocks.groupsPost.mockResolvedValue(
      post('root', { accountId: 'alice.near', groupId: 'dao' })
    );
    mocks.groupsThread.mockResolvedValue([post('one', { groupId: 'dao' })]);

    const page = await loadGuildPostPageData('dao', 'alice.near', 'guild-fit');

    expect(mocks.groupsThread).toHaveBeenCalledWith(
      { author: 'alice.near', groupId: 'dao', postId: 'guild-fit' },
      { limit: THREAD_REPLY_FIRST_PAGE }
    );
    expect(mocks.groupsThreadTree).not.toHaveBeenCalled();
    expect(page?.replyTree[0]?.path).toBe(
      'bob.near/groups/dao/content/post/one'
    );
    expect(page?.replyTree[0]?.replies).toEqual([]);
    expect(page?.directRepliesResolved).toBe(true);
    expect(page?.guildName).toBe('Audit Guild');
    expect(page?.memberDriven).toBe(true);
    expect(page?.accessGated).toBe(true);
  });

  it('keeps a failed guild reply query unresolved', async () => {
    mocks.groupsPost.mockResolvedValue(post('root', { groupId: 'dao' }));
    mocks.groupsThread.mockRejectedValue(new Error('indexer'));

    const page = await loadGuildPostPageData('dao', 'alice.near', 'guild-fail');

    expect(page?.replies).toEqual([]);
    expect(page?.directRepliesResolved).toBe(false);
  });
});
