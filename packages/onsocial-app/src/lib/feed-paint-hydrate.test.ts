import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PostRow,
  ScarcesActiveListingRow,
  ScarcesCollectionCurrentRow,
} from '@onsocial/sdk';
import {
  hydrateCollectionEmbedsForPosts,
  hydrateLazyScarceEmbedsForPosts,
  hydrateTokenEmbedsForPosts,
  loadPostEngagementMap,
} from '@/lib/feed-paint-hydrate';

const ONE_NEAR = '1000000000000000000000000';

function post(accountId: string, postId: string): PostRow {
  return {
    accountId,
    postId,
    value: 'hi',
    blockHeight: 1,
    blockTimestamp: 1,
  };
}

describe('feed-paint-hydrate', () => {
  const activeListings = vi.fn();
  const collectionsCurrent = vi.fn();
  const collectionsCurrentByIds = vi.fn();
  const countsByPaths = vi.fn();
  const statesForPosts = vi.fn();
  const amplifyCountsForPostPaths = vi.fn();

  const os = {
    query: {
      scarces: {
        activeListings,
        collectionsCurrent,
        collectionsCurrentByIds,
      },
      threads: { countsByPaths },
      reactions: { statesForPosts },
      socialSpend: { amplifyCountsForPostPaths },
    },
  };

  beforeEach(() => {
    activeListings.mockReset();
    collectionsCurrent.mockReset();
    collectionsCurrentByIds.mockReset();
    countsByPaths.mockReset();
    statesForPosts.mockReset();
    amplifyCountsForPostPaths.mockReset();
    collectionsCurrent.mockResolvedValue([]);
  });

  it('loadPostEngagementMap batches thread/reaction/amplify counts', async () => {
    countsByPaths.mockResolvedValue({
      'alice.near/post/p1': { replyCount: 2, quoteCount: 1, repostCount: 0 },
    });
    statesForPosts.mockResolvedValue({
      'alice.near:p1': {
        counts: { total: 5 },
        viewerReacted: [],
      },
    });
    amplifyCountsForPostPaths.mockResolvedValue({
      'alice.near/post/p1': { amplifyCount: 3, viewerAmplified: false },
    });

    const map = await loadPostEngagementMap(os as never, [
      post('alice.near', 'p1'),
    ]);

    expect(map['alice.near:p1']).toEqual({
      replyCount: 2,
      quoteCount: 1,
      repostCount: 0,
      reactionCount: 5,
      viewerReacted: false,
      amplifyCount: 3,
      viewerAmplified: false,
      viewerSaved: false,
    });
    expect(countsByPaths).toHaveBeenCalledTimes(1);
    expect(statesForPosts).toHaveBeenCalledTimes(1);
    expect(amplifyCountsForPostPaths).toHaveBeenCalledTimes(1);
  });

  it('hydrateLazyScarceEmbedsForPosts uses one activeListings per creator', async () => {
    const row: ScarcesActiveListingRow = {
      listingKey: 'lazy:ll:1',
      kind: 'lazy',
      listingId: 'll:1',
      tokenId: null,
      sellerId: 'alice.near',
      creatorId: 'alice.near',
      appId: null,
      price: ONE_NEAR,
      priceNumeric: '1',
      reservePrice: null,
      buyNowPrice: null,
      highestBid: null,
      bidCount: null,
      copies: 10,
      remaining: 7,
      mintedCount: 3,
      expiresAt: null,
      title: 'Night',
      media: 'ipfs://bafycover',
      sourcePostPath: 'alice.near/post/p1',
      cardBg: null,
      extraJson: null,
      mediumKind: null,
      audioFormat: null,
      facets: null,
      listedBlockHeight: 1,
      listedBlockTimestamp: 9,
      updatedBlockHeight: 1,
      updatedBlockTimestamp: 9,
    };
    activeListings.mockResolvedValue([row]);

    const map = await hydrateLazyScarceEmbedsForPosts(os as never, [
      post('alice.near', 'p1'),
      post('alice.near', 'p2'),
    ]);

    expect(activeListings).toHaveBeenCalledTimes(1);
    expect(activeListings).toHaveBeenCalledWith({
      sellerId: 'alice.near',
      kinds: ['lazy'],
      limit: 40,
    });
    expect(map['alice.near/post/p1']).toMatchObject({
      status: 'lazy_listing',
      listingId: 'll:1',
      remaining: 7,
      copies: 10,
    });
    expect(map['alice.near/post/p2']).toBeUndefined();
  });

  it('hydrateCollectionEmbedsForPosts batches collectionsCurrentByIds', async () => {
    const row = {
      collectionId: 'drop-1',
      creatorId: 'creator.near',
      appId: null,
      price: ONE_NEAR,
      allowlistPrice: null,
      totalSupply: 10,
      mintedCount: 2,
      remaining: 8,
      startTime: null,
      endTime: null,
      createdAt: 1,
      createdBlockTimestamp: 1,
      mintMode: 'open',
      maxPerWallet: null,
      paused: false,
      cancelled: false,
      banned: false,
      transferable: true,
      renewable: false,
      maxRedeems: null,
      randomAssignment: false,
      appCommissionBps: null,
      title: 'Night',
      media: 'ipfs://bafycover',
      description: null,
      kind: 'audio',
      mediumKind: 'audio',
      metadataTemplate: null,
      metadata: null,
      extraJson: null,
      royaltyJson: null,
      sourcePostPath: null,
    } as unknown as ScarcesCollectionCurrentRow;
    collectionsCurrentByIds.mockResolvedValue([row]);
    activeListings.mockResolvedValue([]);

    const map = await hydrateCollectionEmbedsForPosts(os as never, [
      {
        ...post('alice.near', 'p1'),
        value: JSON.stringify({
          v: 1,
          text: 'night',
          embeds: [
            {
              kind: 'collection',
              chain: 'near',
              contract: 'scarces.onsocial.testnet',
              collectionId: 'drop-1',
            },
          ],
        }),
      },
    ]);

    expect(collectionsCurrentByIds).toHaveBeenCalledWith(['drop-1']);
    expect(map['alice.near/post/p1']).toMatchObject({
      status: 'drop',
      collectionId: 'drop-1',
      creatorId: 'creator.near',
      remaining: 8,
      mediumKind: 'audio',
    });
  });

  it('hydrateTokenEmbedsForPosts resolves listed token embeds', async () => {
    activeListings.mockResolvedValue([
      {
        listingKey: 'native:s:post-1',
        kind: 'native',
        listingId: 'nl:1',
        tokenId: 's:post-1',
        sellerId: 'alice.near',
        creatorId: 'alice.near',
        appId: null,
        price: ONE_NEAR,
        priceNumeric: '1',
        reservePrice: null,
        buyNowPrice: null,
        highestBid: null,
        bidCount: null,
        copies: 1,
        remaining: null,
        mintedCount: null,
        expiresAt: null,
        title: 'Night',
        media: 'ipfs://bafycover',
        sourcePostPath: 'alice.near/post/orig',
        cardBg: null,
        extraJson: null,
        mediumKind: 'art',
        audioFormat: null,
        facets: null,
        listedBlockHeight: 1,
        listedBlockTimestamp: 9,
        updatedBlockHeight: 1,
        updatedBlockTimestamp: 9,
      } satisfies ScarcesActiveListingRow,
    ]);

    const map = await hydrateTokenEmbedsForPosts(os as never, [
      {
        ...post('alice.near', 'announce'),
        value: JSON.stringify({
          v: 1,
          text: 'for sale',
          embeds: [
            {
              kind: 'token',
              chain: 'near',
              contract: 'scarces.onsocial.testnet',
              tokenId: 's:post-1',
            },
          ],
          x: {
            onsocial: {
              drop: {
                tokenId: 's:post-1',
                title: 'Night',
                sourcePostPath: 'alice.near/post/orig',
              },
            },
          },
        }),
      },
    ]);

    expect(activeListings).toHaveBeenCalledWith({
      sellerId: 'alice.near',
      kinds: ['native', 'auction'],
      limit: 40,
    });
    expect(map['alice.near/post/announce']).toMatchObject({
      status: 'listed',
      tokenId: 's:post-1',
      listingId: 'nl:1',
      priceNear: '1',
    });
  });
});
