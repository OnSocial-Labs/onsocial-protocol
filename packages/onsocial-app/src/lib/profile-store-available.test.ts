import { describe, expect, it } from 'vitest';
import {
  buildAvailableStoreShelf,
  dedupeStoreListingsForDrops,
  filterBuyableStoreDrops,
  filterDropsNotListed,
  isStoreTabVisible,
  isScarcesTabVisible,
} from './profile-store-available';
import type {
  ProfileStoreDrop,
  ProfileStoreListing,
  ProfileStoreShelf,
} from './profile-store-types';

const liveDrop: ProfileStoreDrop = {
  key: 'drop-a',
  collectionId: 'drop-a',
  title: 'Live drop',
  mediaUrl: null,
  priceNear: '1',
  remaining: 3,
  totalSupply: 10,
  status: 'live',
};

const soldOutDrop: ProfileStoreDrop = {
  ...liveDrop,
  key: 'drop-b',
  collectionId: 'drop-b',
  title: 'Sold out',
  remaining: 0,
  status: 'sold_out',
};

const lazyListing: ProfileStoreListing = {
  key: 'lazy-a',
  kind: 'lazy',
  title: 'Duplicate edition row',
  priceNear: '1',
  priceLabel: 'From',
  mediaUrl: null,
  collectionId: 'drop-a',
};

const resaleListing: ProfileStoreListing = {
  key: 'native-1',
  kind: 'native',
  title: 'Resale',
  priceNear: '0.1',
  priceLabel: 'Ask',
  mediaUrl: null,
  resale: true,
  tokenId: 'other:1',
};

describe('filterBuyableStoreDrops', () => {
  it('keeps live and upcoming, drops sold-out catalog rows', () => {
    expect(
      filterBuyableStoreDrops([
        liveDrop,
        soldOutDrop,
        { ...liveDrop, status: 'upcoming', key: 'soon' },
        { ...liveDrop, status: 'ended', key: 'ended' },
      ]).map((drop) => drop.status)
    ).toEqual(['live', 'upcoming']);
  });
});

describe('dedupeStoreListingsForDrops', () => {
  it('removes lazy listings that duplicate a live drop card', () => {
    expect(
      dedupeStoreListingsForDrops([lazyListing, resaleListing], [liveDrop])
    ).toEqual([resaleListing]);
  });
});

describe('filterDropsNotListed', () => {
  it('hides drops covered by a listed collection id, keeps the rest', () => {
    expect(
      filterDropsNotListed([liveDrop, soldOutDrop], new Set(['drop-a'])).map(
        (drop) => drop.key
      )
    ).toEqual(['drop-b']);
    expect(filterDropsNotListed([liveDrop], new Set())).toEqual([liveDrop]);
  });
});

describe('buildAvailableStoreShelf', () => {
  it('returns buyable drops, deduped listings, and no sales block', () => {
    const shelf: ProfileStoreShelf = {
      listings: [lazyListing, resaleListing],
      drops: [liveDrop, soldOutDrop],
      sales: [
        {
          key: 'sale-1',
          title: 'Old sale',
          priceNear: '1',
          buyerId: 'buyer',
          blockTimestamp: 1,
          mediaUrl: null,
        },
      ],
      listingCount: 2,
      hasMore: false,
    };

    expect(buildAvailableStoreShelf(shelf)).toEqual({
      listings: [resaleListing],
      drops: [liveDrop],
      sales: [],
      listingCount: 2,
      hasMore: false,
    });
  });
});

describe('isScarcesTabVisible', () => {
  it('shows when available inventory exists', () => {
    expect(
      isScarcesTabVisible(
        {
          listings: [],
          drops: [liveDrop],
          sales: [],
          listingCount: 0,
          hasMore: false,
        },
        0
      )
    ).toBe(true);
  });

  it('shows when only catalog works exist (sold-out / created peeks)', () => {
    expect(
      isScarcesTabVisible(
        {
          listings: [],
          drops: [soldOutDrop],
          sales: [],
          listingCount: 0,
          hasMore: false,
        },
        3
      )
    ).toBe(true);
  });

  it('is false when no buyable shelf and no created works', () => {
    expect(
      isScarcesTabVisible(
        {
          listings: [],
          drops: [soldOutDrop],
          sales: [],
          listingCount: 0,
          hasMore: false,
        },
        0
      )
    ).toBe(false);
  });
});

describe('isStoreTabVisible', () => {
  it('is false when only sold-out drops and sales remain', () => {
    expect(
      isStoreTabVisible({
        listings: [],
        drops: [soldOutDrop],
        sales: [
          {
            key: 's',
            title: 'x',
            priceNear: '1',
            buyerId: null,
            blockTimestamp: 0,
            mediaUrl: null,
          },
        ],
        listingCount: 0,
        hasMore: false,
      })
    ).toBe(false);
  });

  it('is true when buyable inventory or more listings are loading', () => {
    expect(
      isStoreTabVisible({
        listings: [],
        drops: [liveDrop],
        sales: [],
        listingCount: 0,
        hasMore: false,
      })
    ).toBe(true);
    expect(
      isStoreTabVisible({
        listings: [],
        drops: [],
        sales: [],
        listingCount: 0,
        hasMore: true,
      })
    ).toBe(true);
  });
});
