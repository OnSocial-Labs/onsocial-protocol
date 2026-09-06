import { describe, expect, it } from 'vitest';
import {
  isMarketListingEnded,
  partitionMarketListingsLiveFirst,
} from '@/features/market/market-listing-rank';
import type { MarketListingItem } from '@/features/market/market-listings';

const NOW = 1_700_000_000_000;

const base: Omit<MarketListingItem, 'kind' | 'tokenId'> = {
  creatorId: 'seller.testnet',
  title: 'Scarce',
  priceNear: '1',
  blockTimestamp: 1,
};

describe('isMarketListingEnded', () => {
  it('is false for fixed and primary rows', () => {
    expect(isMarketListingEnded({ kind: 'native', expiresAtNs: NOW - 1 }, NOW)).toBe(
      false
    );
    expect(isMarketListingEnded({ kind: 'lazy' }, NOW)).toBe(false);
  });

  it('is false until the auction clock exists and has elapsed', () => {
    expect(isMarketListingEnded({ kind: 'auction' }, NOW)).toBe(false);
    expect(
      isMarketListingEnded({ kind: 'auction', expiresAtNs: NOW + 60_000 }, NOW)
    ).toBe(false);
    expect(
      isMarketListingEnded({ kind: 'auction', expiresAtNs: NOW }, NOW)
    ).toBe(true);
    expect(
      isMarketListingEnded({ kind: 'auction', expiresAtNs: NOW - 1 }, NOW)
    ).toBe(true);
  });
});

describe('partitionMarketListingsLiveFirst', () => {
  it('keeps live rows first when newest ended auctions arrive first', () => {
    const ended: MarketListingItem = {
      ...base,
      kind: 'auction',
      tokenId: 's:ended',
      title: 'Ended lot',
      blockTimestamp: 90,
      expiresAtNs: NOW - 60_000,
    };
    const liveAsk: MarketListingItem = {
      ...base,
      kind: 'native',
      tokenId: 's:ask',
      title: 'Live ask',
      blockTimestamp: 40,
    };
    const liveBid: MarketListingItem = {
      ...base,
      kind: 'auction',
      tokenId: 's:live',
      title: 'Live auction',
      blockTimestamp: 30,
      expiresAtNs: NOW + 120_000,
    };
    const liveMint: MarketListingItem = {
      ...base,
      kind: 'lazy',
      listingId: 'll:mint',
      title: 'Live mint',
      blockTimestamp: 20,
    };

    const { live, ended: endedRows } = partitionMarketListingsLiveFirst(
      [ended, liveAsk, liveBid, liveMint],
      NOW
    );

    expect(live.map((row) => row.tokenId ?? row.listingId)).toEqual([
      's:ask',
      's:live',
      'll:mint',
    ]);
    expect(endedRows.map((row) => row.tokenId)).toEqual(['s:ended']);
  });

  it('preserves indexer order inside each group', () => {
    const olderEnded: MarketListingItem = {
      ...base,
      kind: 'auction',
      tokenId: 's:older-ended',
      blockTimestamp: 10,
      expiresAtNs: NOW - 120_000,
    };
    const newerEnded: MarketListingItem = {
      ...base,
      kind: 'auction',
      tokenId: 's:newer-ended',
      blockTimestamp: 80,
      expiresAtNs: NOW - 1,
    };

    const { ended } = partitionMarketListingsLiveFirst(
      [newerEnded, olderEnded],
      NOW
    );
    expect(ended.map((row) => row.tokenId)).toEqual([
      's:newer-ended',
      's:older-ended',
    ]);
  });
});
