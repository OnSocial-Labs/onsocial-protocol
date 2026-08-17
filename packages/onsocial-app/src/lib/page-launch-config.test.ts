import { describe, expect, it } from 'vitest';
import {
  orderStoreShelfByPins,
  preferPinnedOrder,
  sanitizeLinkNotes,
  sanitizeSectionPins,
  storeDropPinId,
  storeListingPinId,
  storeShelfPinCandidates,
  toggleSectionPin,
} from './page-launch-config';
import type { ProfileStoreShelf } from './profile-store-types';

describe('preferPinnedOrder', () => {
  it('leads with known pins then keeps remaining order', () => {
    const items = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ];
    expect(
      preferPinnedOrder(items, ['c', 'missing', 'a'], (item) => item.id)
    ).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'd' }]);
  });
});

describe('sanitizeSectionPins', () => {
  it('caps pins and drops unknown sections', () => {
    expect(
      sanitizeSectionPins({
        posts: ['1', '2', '3', '4'],
        profile: ['x'],
        groups: ['g1', ''],
      })
    ).toEqual({
      posts: ['1', '2', '3'],
      groups: ['g1'],
    });
  });
});

describe('sanitizeLinkNotes', () => {
  it('trims and drops empty notes', () => {
    expect(
      sanitizeLinkNotes({
        website: '  Weekly essays  ',
        x: '   ',
      })
    ).toEqual({ website: 'Weekly essays' });
  });
});

describe('toggleSectionPin', () => {
  it('adds, removes, and rotates at max', () => {
    expect(toggleSectionPin(['a'], 'b', 3)).toEqual(['a', 'b']);
    expect(toggleSectionPin(['a', 'b'], 'a', 3)).toEqual(['b']);
    expect(toggleSectionPin(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });
});

const SAMPLE_STORE: ProfileStoreShelf = {
  drops: [
    {
      key: 'drop-a',
      collectionId: 'drop-a',
      title: 'Alpha',
      mediaUrl: null,
      priceNear: '1',
      remaining: 2,
      totalSupply: 10,
      status: 'live',
    },
    {
      key: 'drop-b',
      collectionId: 'drop-b',
      title: 'Beta',
      mediaUrl: null,
      priceNear: null,
      remaining: 0,
      totalSupply: 5,
      status: 'sold_out',
    },
  ],
  listings: [
    {
      key: 'list-1',
      kind: 'native',
      title: 'Listing One',
      priceNear: '2',
      priceLabel: 'Ask',
      mediaUrl: null,
    },
    {
      key: 'list-2',
      kind: 'lazy',
      title: 'Listing Two',
      priceNear: '3',
      priceLabel: 'From',
      mediaUrl: null,
      remaining: 4,
    },
  ],
  sales: [],
  listingCount: 2,
  hasMore: false,
};

describe('store shelf pins', () => {
  it('builds drop and listing candidates with stable ids', () => {
    expect(storeShelfPinCandidates(SAMPLE_STORE)).toEqual([
      { id: storeDropPinId('drop-a'), label: 'Drop · Alpha' },
      { id: storeDropPinId('drop-b'), label: 'Drop · Beta' },
      { id: storeListingPinId('list-1'), label: 'For sale · Listing One' },
      { id: storeListingPinId('list-2'), label: 'For sale · Listing Two' },
    ]);
  });

  it('reorders drops and listings independently by pin list', () => {
    const ordered = orderStoreShelfByPins(SAMPLE_STORE, [
      storeListingPinId('list-2'),
      storeDropPinId('drop-b'),
    ]);
    expect(ordered.drops.map((d) => d.collectionId)).toEqual([
      'drop-b',
      'drop-a',
    ]);
    expect(ordered.listings.map((l) => l.key)).toEqual(['list-2', 'list-1']);
  });
});
