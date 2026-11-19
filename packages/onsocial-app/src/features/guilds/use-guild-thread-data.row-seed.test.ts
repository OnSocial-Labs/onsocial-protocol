/**
 * @vitest-environment jsdom
 */
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';

const groupsPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: {
      groups: {
        post: groupsPost,
        quotes: async () => [],
        threadTree: async () => ({ replies: [] }),
      },
      threads: {
        repliesByPath: async () => [],
        visibleReplies: async () => [],
      },
    },
    groups: { getConfig: async () => null },
  }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { clearGuildThreadSessionCache } from '@/lib/thread-session-cache';
import { clearThreadFirstPageCache } from '@/lib/thread-first-page';
import {
  useGuildThreadData,
  type GuildThreadLoadState,
} from '@/features/guilds/use-guild-thread-data';
import type { ThreadRootRevision } from '@/lib/row-seed-root';

function indexedRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'p1',
    groupId: 'dao',
    value: JSON.stringify({ v: 1, text: 'from the row' }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-row',
    authorName: 'Ada Lovelace',
    replyCount: 4,
    quoteCount: 1,
    quotedPost: { postId: 'quoted-1', value: '{"text":"quoted body"}' },
    isGroupContent: true,
    ...overrides,
  } as PostRow;
}

function fetchedRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'p1',
    groupId: 'dao',
    value: JSON.stringify({ v: 1, text: 'from the refetch' }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-row',
    isGroupContent: true,
    ...overrides,
  } as PostRow;
}

function seed(root: PostRow, ssr = false): GuildPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    ...(ssr ? { directRepliesResolved: true } : {}),
    guildName: 'Dao',
    memberDriven: false,
    accessGated: false,
    engagement: {},
    scarceEmbeds: {},
  };
}

function Probe({
  initial,
  onResult,
}: {
  initial: GuildPostPageData | null;
  onResult: (result: {
    root: PostRow | null;
    revision: ThreadRootRevision | null;
    loadState: GuildThreadLoadState;
  }) => void;
}) {
  const data = useGuildThreadData({
    groupId: 'dao',
    author: 'alice.near',
    postId: 'p1',
    initial,
    accountId: null,
    walletLoading: false,
  });
  useEffect(() => {
    onResult({
      root: data.conversation.root,
      revision: data.rootRevision,
      loadState: data.loadState,
    });
  }, [data.conversation.root, data.loadState, data.rootRevision, onResult]);
  return null;
}

describe('guild thread row seed', () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: {
    root: PostRow | null;
    revision: ThreadRootRevision | null;
    loadState: GuildThreadLoadState;
  };

  beforeEach(() => {
    clearGuildThreadSessionCache();
    clearThreadFirstPageCache();
    groupsPost.mockReset();
    latest = { root: null, revision: null, loadState: 'loading' };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function paint(initial: GuildPostPageData | null) {
    const onResult = (result: typeof latest) => {
      latest = result;
    };
    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(Probe, { initial, onResult }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('keeps the feed row object after the background read', async () => {
    const painted = indexedRow();
    groupsPost.mockResolvedValue(
      fetchedRow({ blockHeight: 240, receiptId: 'receipt-next' })
    );
    await paint(seed(painted));
    expect(latest.root).toBe(painted);
    expect(latest.root?.authorName).toBe('Ada Lovelace');
    expect(latest.root?.replyCount).toBe(4);
    expect(latest.root?.quotedPost).toEqual({
      postId: 'quoted-1',
      value: '{"text":"quoted body"}',
    });
    expect(latest.root?.value).toContain('from the row');
    expect(latest.root?.value).not.toContain('from the refetch');
    expect(latest.revision).toBe('edited');
  });

  it('marks an empty indexed read as Deleted and a thrown read as nothing', async () => {
    const painted = indexedRow();
    groupsPost.mockResolvedValue(null);
    await paint(seed(painted));
    expect(latest.root).toBe(painted);
    expect(latest.revision).toBe('deleted');

    groupsPost.mockRejectedValue(new Error('timeout'));
    await paint(seed(indexedRow()));
    expect(latest.root?.value).toContain('from the row');
    expect(latest.revision).toBeNull();
    expect(latest.loadState).toBe('ready');
  });

  it('still replaces the root on an SSR open', async () => {
    const painted = indexedRow({
      authorName: undefined,
      replyCount: undefined,
      quotedPost: undefined,
    });
    const next = fetchedRow({
      blockHeight: 240,
      value: JSON.stringify({ v: 1, text: 'from the refetch' }),
    });
    groupsPost.mockResolvedValue(next);
    await paint(seed(painted, true));
    expect(latest.root).toBe(next);
    expect(latest.revision).toBeNull();
    expect(latest.root?.value).toContain('from the refetch');
  });
});
