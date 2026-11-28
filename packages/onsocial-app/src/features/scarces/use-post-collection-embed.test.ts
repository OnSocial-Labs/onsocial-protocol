// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import {
  clearScarceEmbedLedger,
  getScarceEmbedSeed,
  seedScarceEmbedsFromSsr,
} from '@/features/scarces/scarce-embed-ledger';

const collectionsCurrentByIds = vi.fn();
const activeListings = vi.fn();
const hydrateWritingManifest = vi.fn();
const collectionCurrentRowToView = vi.fn();
const rememberCollectionView = vi.fn();

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: {
      scarces: {
        collectionsCurrentByIds,
        activeListings,
      },
    },
  }),
}));

vi.mock('@/features/scarces/collections-data', () => ({
  collectionCurrentRowToView: (...args: unknown[]) =>
    collectionCurrentRowToView(...args),
  hydrateWritingManifest: (...args: unknown[]) =>
    hydrateWritingManifest(...args),
}));

vi.mock('@/features/scarces/collection-view-cache', () => ({
  rememberCollectionView: (...args: unknown[]) =>
    rememberCollectionView(...args),
}));

import { usePostCollectionEmbed } from '@/features/scarces/use-post-collection-embed';

const KEY = 'alice.near/post/held-drop';

function dropPost(over: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'held-drop',
    value: JSON.stringify({
      v: 1,
      text: 'A drop announce.',
      embeds: [
        {
          kind: 'collection',
          chain: 'near',
          contract: 'scarces.near',
          collectionId: 'held-essay',
        },
      ],
      x: {
        onsocial: {
          drop: {
            collectionId: 'held-essay',
            title: 'Held essay',
            mediumKind: 'writing',
            priceNear: '1',
          },
        },
      },
    }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: 'receipt-held-drop',
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: '',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    ...over,
  } as PostRow;
}

function seedEmbed(over: Partial<PostScarceEmbed> = {}): PostScarceEmbed {
  return {
    status: 'drop',
    collectionId: 'held-essay',
    priceNear: '1',
    mediumKind: 'writing',
    events: [],
    ...over,
  };
}

function catalogRow() {
  return {
    collectionId: 'held-essay',
    creatorId: 'alice.near',
    appId: null,
    price: '1000000000000000000000000',
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: null,
    createdAt: 1_700_000_000_000_000_000,
    mintMode: null,
    maxPerWallet: null,
    paused: false,
    cancelled: false,
    banned: false,
    transferable: true,
    renewable: false,
    maxRedeems: null,
    randomAssignment: false,
    appCommissionBps: null,
    title: 'Held essay',
    media: null,
    description: null,
    kind: 'writing',
    mediumKind: 'writing',
    sourcePostPath: 'alice.near/post/source-essay',
    metadataTemplate: JSON.stringify({
      title: 'Held essay',
      extra: JSON.stringify({
        kind: 'writing',
        writingFormat: 'essay',
        sourcePost: { path: 'alice.near/post/source-essay' },
      }),
    }),
    metadata: null,
    extraJson: JSON.stringify({
      kind: 'writing',
      writingFormat: 'essay',
      sourcePost: { path: 'alice.near/post/source-essay' },
    }),
    royaltyJson: null,
  };
}

describe('usePostCollectionEmbed', () => {
  beforeEach(() => {
    clearScarceEmbedLedger();
    collectionsCurrentByIds.mockReset();
    activeListings.mockReset().mockResolvedValue([]);
    hydrateWritingManifest.mockReset();
    collectionCurrentRowToView.mockReset();
    rememberCollectionView.mockReset();
    collectionCurrentRowToView.mockImplementation((row: { title: string }) => ({
      collectionId: 'held-essay',
      creatorId: 'alice.near',
      title: row.title,
      kind: 'writing',
      writingFormat: null,
      sourcePostPath: 'alice.near/post/source-essay',
      playables: [],
      readables: [],
      bookPdf: null,
      mediaUrl: null,
    }));
    hydrateWritingManifest.mockImplementation(async (view: unknown) => view);
  });

  it('does not refetch a seeded commerce-ready card', async () => {
    seedScarceEmbedsFromSsr({ [KEY]: seedEmbed() });
    collectionsCurrentByIds.mockResolvedValue([catalogRow()]);

    renderHook(() => usePostCollectionEmbed(dropPost(), { force: false }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(collectionsCurrentByIds).not.toHaveBeenCalled();
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('1');
  });

  it('keeps fetching while a drop Read holds for writing meta', async () => {
    seedScarceEmbedsFromSsr({ [KEY]: seedEmbed() });
    let release: (rows: unknown[]) => void = () => {};
    collectionsCurrentByIds.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const { result } = renderHook(() =>
      usePostCollectionEmbed(dropPost(), { holdForWriting: true })
    );

    await waitFor(() => {
      expect(collectionsCurrentByIds).toHaveBeenCalledWith(['held-essay']);
    });
    expect(result.current.writingMetaSettled).toBe(false);

    await act(async () => {
      release([catalogRow()]);
    });

    await waitFor(() => {
      expect(result.current.writingMetaSettled).toBe(true);
    });
    expect(result.current.sourcePostPath).toBe('alice.near/post/source-essay');
  });

  it('ignores a slower reply after a newer run starts', async () => {
    let releaseSlow: (rows: unknown[]) => void = () => {};
    let releaseFast: (rows: unknown[]) => void = () => {};
    collectionsCurrentByIds
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseSlow = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseFast = resolve;
        })
      );

    const { result, rerender } = renderHook(
      ({ force }: { force: boolean }) =>
        usePostCollectionEmbed(dropPost(), { force }),
      { initialProps: { force: true } }
    );

    await waitFor(() => {
      expect(collectionsCurrentByIds).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender({ force: true });
      result.current.retry();
    });

    await waitFor(() => {
      expect(collectionsCurrentByIds).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      releaseFast([
        {
          ...catalogRow(),
          title: 'Fast essay',
          metadataTemplate: JSON.stringify({ title: 'Fast essay' }),
        },
      ]);
    });
    await waitFor(() => {
      expect(result.current.dropTitle).toBe('Fast essay');
    });

    await act(async () => {
      releaseSlow([
        {
          ...catalogRow(),
          title: 'Slow essay',
          metadataTemplate: JSON.stringify({ title: 'Slow essay' }),
        },
      ]);
      await Promise.resolve();
    });

    expect(result.current.dropTitle).toBe('Fast essay');
  });

  it('does not write after unmount', async () => {
    let release: (rows: unknown[]) => void = () => {};
    collectionsCurrentByIds.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const { unmount } = renderHook(() =>
      usePostCollectionEmbed(dropPost(), { force: true })
    );

    await waitFor(() => {
      expect(collectionsCurrentByIds).toHaveBeenCalled();
    });

    unmount();

    await act(async () => {
      release([catalogRow()]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rememberCollectionView).not.toHaveBeenCalled();
    expect(getScarceEmbedSeed(KEY)).toBeNull();
  });
});
