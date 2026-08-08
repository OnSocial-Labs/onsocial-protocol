import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow, ScarcesActiveListingRow } from '@onsocial/sdk';
import {
  hydrateLazyScarceEmbedsForPosts,
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
  const countsByPaths = vi.fn();
  const statesForPosts = vi.fn();
  const amplifyCountsForPostPaths = vi.fn();

  const os = {
    query: {
      scarces: { activeListings },
      threads: { countsByPaths },
      reactions: { statesForPosts },
      socialSpend: { amplifyCountsForPostPaths },
    },
  };

  beforeEach(() => {
    activeListings.mockReset();
    countsByPaths.mockReset();
    statesForPosts.mockReset();
    amplifyCountsForPostPaths.mockReset();
  });

  it('loadPostEngagementMap batches thread/reaction/amplify counts', async () => {
    countsByPaths.mockResolvedValue({
      'alice.near/post/p1': { replyCount: 2, quoteCount: 1 },
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
      reactionCount: 5,
      viewerReacted: false,
      amplifyCount: 3,
      viewerAmplified: false,
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
});
