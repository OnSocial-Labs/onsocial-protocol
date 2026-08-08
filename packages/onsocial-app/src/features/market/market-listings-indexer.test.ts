import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const activeListings = vi.fn();
const ownedBy = vi.fn();
const collectionCurrent = vi.fn();
const viewNearContract = vi.fn();

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: {
      scarces: {
        activeListings,
        ownedBy,
        collectionCurrent,
      },
    },
  }),
}));

vi.mock('@/lib/app-near-rpc', async () => {
  const actual = await vi.importActual<typeof import('@/lib/app-near-rpc')>(
    '@/lib/app-near-rpc'
  );
  return {
    ...actual,
    viewNearContract: (...args: unknown[]) => viewNearContract(...args),
  };
});

vi.mock('@/lib/post-routes', () => ({
  resolvePostThreadHrefsFromSourcePaths: async () => new Map(),
}));

import {
  fetchLiveListingsForCreator,
  fetchOwnedScarcesPage,
  invalidateLiveListingsCache,
} from '@/features/market/market-listings';

const ONE_NEAR_YOCTO = '1000000000000000000000000';

describe('indexer-first market listings', () => {
  beforeEach(() => {
    invalidateLiveListingsCache();
    activeListings.mockReset();
    ownedBy.mockReset();
    collectionCurrent.mockReset();
    viewNearContract.mockReset();
  });

  afterEach(() => {
    invalidateLiveListingsCache();
  });

  it('fetchLiveListingsForCreator uses activeListings and never RPC', async () => {
    activeListings.mockResolvedValue([
      {
        listingKey: 'lazy:ll:1',
        kind: 'lazy',
        listingId: 'll:1',
        tokenId: null,
        sellerId: 'alice.near',
        creatorId: 'alice.near',
        appId: null,
        price: ONE_NEAR_YOCTO,
        priceNumeric: '1',
        reservePrice: null,
        buyNowPrice: null,
        highestBid: null,
        bidCount: null,
        copies: 10,
        remaining: 7,
        mintedCount: 3,
        expiresAt: null,
        title: 'Night Drive',
        media: 'ipfs://bafycover',
        sourcePostPath: 'alice.near/post/p1',
        cardBg: null,
        extraJson: null,
        listedBlockHeight: 1,
        listedBlockTimestamp: Date.now(),
        updatedBlockHeight: 1,
        updatedBlockTimestamp: Date.now(),
      },
    ]);

    const items = await fetchLiveListingsForCreator('alice.near');

    expect(activeListings).toHaveBeenCalledWith({
      sellerId: 'alice.near',
      kinds: ['lazy'],
      limit: 40,
    });
    expect(viewNearContract).not.toHaveBeenCalled();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'lazy',
      listingId: 'll:1',
      creatorId: 'alice.near',
      title: 'Night Drive',
      remaining: 7,
      sourcePostPath: 'alice.near/post/p1',
    });
  });

  it('fetchOwnedScarcesPage uses ownedBy + collectionCurrent without nft_tokens_for_owner', async () => {
    ownedBy.mockResolvedValue({
      items: [
        {
          tokenId: 'drop-1:2',
          ownerId: 'bob.near',
          burned: false,
          collectionId: 'drop-1',
          appId: null,
          mintedBlockTimestamp: 1,
          updatedBlockTimestamp: 2,
        },
      ],
      nextOffset: undefined,
    });
    collectionCurrent.mockResolvedValue({
      collectionId: 'drop-1',
      creatorId: 'alice.near',
      appId: null,
      price: ONE_NEAR_YOCTO,
      allowlistPrice: null,
      totalSupply: 10,
      mintedCount: 2,
      remaining: 8,
      startTime: null,
      endTime: null,
      createdAt: null,
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
      title: 'Drop One',
      media: 'bafymediaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      description: 'A drop',
      kind: 'audio',
      metadataTemplate: null,
      metadata: null,
      extraJson: JSON.stringify({ kind: 'audio', audioFormat: 'single' }),
      royaltyJson: null,
    });
    activeListings.mockResolvedValue([]);

    const page = await fetchOwnedScarcesPage('bob.near');

    expect(ownedBy).toHaveBeenCalledWith('bob.near', {
      limit: 24,
      offset: 0,
    });
    expect(collectionCurrent).toHaveBeenCalledWith('drop-1');
    expect(viewNearContract).not.toHaveBeenCalled();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      tokenId: 'drop-1:2',
      title: 'Drop One',
      ownerId: 'bob.near',
      collectionId: 'drop-1',
      mediumKind: 'audio',
      listingKind: null,
    });
    expect(page.hasMore).toBe(false);
  });

  it('fetchOwnedScarcesPage falls back to RPC when ownedBy fails', async () => {
    ownedBy.mockRejectedValue(new Error('hasura down'));
    viewNearContract.mockImplementation(
      async (_contract: string, method: string) => {
        if (method === 'nft_supply_for_owner') return '1';
        if (method === 'nft_tokens_for_owner') {
          return [
            {
              token_id: 's:99',
              owner_id: 'bob.near',
              metadata: {
                title: 'Solo',
                media: null,
                extra: null,
              },
            },
          ];
        }
        if (method === 'get_sales_by_owner_id') return [];
        throw new Error(`unexpected ${method}`);
      }
    );
    // Indexer listed-state path fails with ownedBy; RPC sales path used after.
    activeListings.mockRejectedValue(new Error('hasura down'));

    const page = await fetchOwnedScarcesPage('bob.near');

    expect(viewNearContract).toHaveBeenCalledWith(
      expect.any(String),
      'nft_supply_for_owner',
      expect.objectContaining({ account_id: 'bob.near' })
    );
    expect(viewNearContract).toHaveBeenCalledWith(
      expect.any(String),
      'nft_tokens_for_owner',
      expect.any(Object)
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.tokenId).toBe('s:99');
  });
});
