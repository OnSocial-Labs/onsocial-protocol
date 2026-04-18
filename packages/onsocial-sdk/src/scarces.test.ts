import { describe, expect, it } from 'vitest';
import {
  buildCreateCollectionAction,
  buildCreateLazyListingAction,
  buildListNativeScarceAction,
  buildMintFromCollectionAction,
  buildPurchaseNativeScarceAction,
  buildQuickMintAction,
  buildTransferScarceAction,
  nearToYocto,
} from './scarces.js';

describe('scarces action builders', () => {
  it('converts NEAR amounts to yocto strings', () => {
    expect(nearToYocto('1.5')).toBe('1500000000000000000000000');
  });

  it('builds a quick mint action with prepared media references', () => {
    expect(
      buildQuickMintAction({
        title: 'Genesis',
        description: 'First',
        mediaCid: 'bafy123',
        mediaHash: 'hash',
        copies: 10,
        extra: { rarity: 'legendary' },
        royalty: { 'alice.near': 500 },
        appId: 'onsocial',
      }),
    ).toEqual({
      type: 'quick_mint',
      metadata: {
        title: 'Genesis',
        description: 'First',
        media: 'ipfs://bafy123',
        media_hash: 'hash',
        copies: 10,
        extra: JSON.stringify({ rarity: 'legendary' }),
      },
      royalty: { 'alice.near': 500 },
      app_id: 'onsocial',
    });
  });

  it('builds a create collection action with flattened config', () => {
    expect(
      buildCreateCollectionAction({
        collectionId: 'genesis',
        totalSupply: 1000,
        title: 'Genesis Collection',
        description: 'Season one',
        extra: { season: 1 },
        priceNear: '2',
        startTime: '100',
        endTime: '200',
        appId: 'onsocial',
        mintMode: 'public',
        maxPerWallet: 3,
        renewable: true,
        transferable: true,
        burnable: false,
      }),
    ).toEqual({
      type: 'create_collection',
      collection_id: 'genesis',
      total_supply: 1000,
      metadata_template: JSON.stringify({
        title: 'Genesis Collection',
        description: 'Season one',
        extra: JSON.stringify({ season: 1 }),
      }),
      price_near: '2000000000000000000000000',
      start_time: 100,
      end_time: 200,
      app_id: 'onsocial',
      mint_mode: 'public',
      max_per_wallet: 3,
      renewable: true,
      transferable: true,
      burnable: false,
    });
  });

  it('builds transfer, listing, purchase, and collection mint actions', () => {
    expect(buildTransferScarceAction('1', 'bob.near', 'gift')).toEqual({
      type: 'transfer_scarce',
      token_id: '1',
      receiver_id: 'bob.near',
      memo: 'gift',
    });

    expect(
      buildListNativeScarceAction({
        tokenId: '1',
        priceNear: '3.25',
        expiresAt: '123',
      }),
    ).toEqual({
      type: 'list_native_scarce',
      token_id: '1',
      price: '3250000000000000000000000',
      expires_at: 123,
    });

    expect(buildPurchaseNativeScarceAction('1')).toEqual({
      type: 'purchase_native_scarce',
      token_id: '1',
    });

    expect(buildMintFromCollectionAction('genesis', 2, 'carol.near')).toEqual({
      type: 'mint_from_collection',
      collection_id: 'genesis',
      quantity: 2,
      receiver_id: 'carol.near',
    });
  });

  it('builds a lazy listing action with prepared media references', () => {
    expect(
      buildCreateLazyListingAction({
        title: 'Limited Print',
        priceNear: '5',
        mediaCid: 'bafy456',
        mediaHash: 'hash2',
        appId: 'onsocial',
        transferable: true,
        burnable: false,
        expiresAt: '999',
      }),
    ).toEqual({
      type: 'create_lazy_listing',
      metadata: {
        title: 'Limited Print',
        media: 'ipfs://bafy456',
        media_hash: 'hash2',
      },
      price: '5000000000000000000000000',
      app_id: 'onsocial',
      transferable: true,
      burnable: false,
      expires_at: 999,
    });
  });
});