import { describe, expect, it } from 'vitest';
import {
  listedCollectionIdSet,
  marketCreatorCatalogShell,
  marketCreatorShop,
  marketCreatorShopActionLabel,
} from '@/features/market/market-creator-view';

describe('market creator view', () => {
  it('is shop mode only when a creator is set', () => {
    expect(marketCreatorShop('alice.near')).toBe(true);
    expect(marketCreatorShop('  ')).toBe(false);
    expect(marketCreatorShop(null)).toBe(false);
  });

  it('keeps a skeleton on SSR miss until the client catalog settles', () => {
    expect(
      marketCreatorCatalogShell({
        hasDrops: false,
        hasListings: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('skeleton');
    expect(
      marketCreatorCatalogShell({
        hasDrops: true,
        hasListings: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('ready');
    expect(
      marketCreatorCatalogShell({
        hasDrops: false,
        hasListings: true,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('ready');
    expect(
      marketCreatorCatalogShell({
        hasDrops: false,
        hasListings: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('empty');
  });

  it('uses Collect on live drops and Open otherwise', () => {
    expect(marketCreatorShopActionLabel('live')).toBe('Collect');
    expect(marketCreatorShopActionLabel('ended')).toBe('Open');
    expect(marketCreatorShopActionLabel('upcoming')).toBe('Open');
  });

  it('reads listing collection ids from the row or the token', () => {
    expect(
      [...listedCollectionIdSet([
        { collectionId: 'night-drive' },
        { tokenId: 'dusk-run:1' },
        { collectionId: '  ', tokenId: null },
      ])].sort()
    ).toEqual(['dusk-run', 'night-drive']);
  });
});
