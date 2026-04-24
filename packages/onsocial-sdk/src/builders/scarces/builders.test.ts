import { describe, expect, it } from 'vitest';
import {
  buildAcceptCollectionOfferAction,
  buildAcceptOfferAction,
  buildAirdropAction,
  buildBatchTransferAction,
  buildBurnScarceAction,
  buildCancelAuctionAction,
  buildCancelCollectionOfferAction,
  buildCancelOfferAction,
  buildCreateCollectionAction,
  buildCreateLazyListingAction,
  buildDelistNativeScarceAction,
  buildDeleteCollectionAction,
  buildListAuctionAction,
  buildListNativeScarceAction,
  buildMakeCollectionOfferAction,
  buildMakeOfferAction,
  buildMintFromCollectionAction,
  buildPauseCollectionAction,
  buildPlaceBidAction,
  buildPurchaseFromCollectionAction,
  buildPurchaseLazyListingAction,
  buildPurchaseNativeScarceAction,
  buildQuickMintAction,
  buildResumeCollectionAction,
  buildSettleAuctionAction,
  buildTransferScarceAction,
  nearToYocto,
} from './index.js';

describe('scarces builders — primitives', () => {
  it('converts NEAR to yocto', () => {
    expect(nearToYocto('1.5')).toBe('1500000000000000000000000');
  });
});

describe('scarces builders — tokens', () => {
  it('quick_mint flattens metadata + royalty + app_id', () => {
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
      })
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

  it('transfer_scarce includes optional memo', () => {
    expect(buildTransferScarceAction('1', 'bob.near', 'gift')).toEqual({
      type: 'transfer_scarce',
      token_id: '1',
      receiver_id: 'bob.near',
      memo: 'gift',
    });
  });

  it('batch_transfer wraps the transfer list', () => {
    expect(
      buildBatchTransferAction([
        { token_id: '1', receiver_id: 'a.near' },
        { token_id: '2', receiver_id: 'b.near', memo: 'm' },
      ])
    ).toEqual({
      type: 'batch_transfer',
      transfers: [
        { token_id: '1', receiver_id: 'a.near' },
        { token_id: '2', receiver_id: 'b.near', memo: 'm' },
      ],
    });
  });

  it('burn_scarce includes optional collection_id', () => {
    expect(buildBurnScarceAction('1')).toEqual({
      type: 'burn_scarce',
      token_id: '1',
    });
    expect(buildBurnScarceAction('1', 'genesis')).toEqual({
      type: 'burn_scarce',
      token_id: '1',
      collection_id: 'genesis',
    });
  });
});

describe('scarces builders — collections', () => {
  it('create_collection flattens config and serializes metadata template', () => {
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
      })
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

  it('mint_from_collection includes optional receiver', () => {
    expect(buildMintFromCollectionAction('genesis', 2, 'carol.near')).toEqual({
      type: 'mint_from_collection',
      collection_id: 'genesis',
      quantity: 2,
      receiver_id: 'carol.near',
    });
  });

  it('purchase_from_collection encodes max price as yocto', () => {
    expect(buildPurchaseFromCollectionAction('genesis', '2.5', 3)).toEqual({
      type: 'purchase_from_collection',
      collection_id: 'genesis',
      quantity: 3,
      max_price_per_token: '2500000000000000000000000',
    });
  });

  it('airdrop_from_collection wraps receiver list', () => {
    expect(buildAirdropAction('genesis', ['a.near', 'b.near'])).toEqual({
      type: 'airdrop_from_collection',
      collection_id: 'genesis',
      receivers: ['a.near', 'b.near'],
    });
  });

  it('lifecycle actions (pause/resume/delete) all carry collection_id', () => {
    expect(buildPauseCollectionAction('g').type).toBe('pause_collection');
    expect(buildResumeCollectionAction('g').type).toBe('resume_collection');
    expect(buildDeleteCollectionAction('g').type).toBe('delete_collection');
    expect(buildPauseCollectionAction('g').collection_id).toBe('g');
  });
});

describe('scarces builders — market', () => {
  it('list_native_scarce encodes price + optional expires_at', () => {
    expect(
      buildListNativeScarceAction({
        tokenId: '1',
        priceNear: '3.25',
        expiresAt: '123',
      })
    ).toEqual({
      type: 'list_native_scarce',
      token_id: '1',
      price: '3250000000000000000000000',
      expires_at: 123,
    });
  });

  it('delist + purchase carry only token_id', () => {
    expect(buildDelistNativeScarceAction('1')).toEqual({
      type: 'delist_native_scarce',
      token_id: '1',
    });
    expect(buildPurchaseNativeScarceAction('1')).toEqual({
      type: 'purchase_native_scarce',
      token_id: '1',
    });
  });
});

describe('scarces builders — auctions', () => {
  it('list_auction encodes reserve + min increment, optional buy_now + expires_at', () => {
    expect(
      buildListAuctionAction({
        tokenId: '1',
        reservePriceNear: '1',
        minBidIncrementNear: '0.1',
        buyNowPriceNear: '5',
        expiresAt: '999',
      })
    ).toEqual({
      type: 'list_auction',
      token_id: '1',
      reserve_price: '1000000000000000000000000',
      min_bid_increment: '100000000000000000000000',
      buy_now_price: '5000000000000000000000000',
      expires_at: 999,
    });
  });

  it('place_bid + settle + cancel carry token_id', () => {
    expect(buildPlaceBidAction('1', '0.5')).toEqual({
      type: 'place_bid',
      token_id: '1',
      amount: '500000000000000000000000',
    });
    expect(buildSettleAuctionAction('1').type).toBe('settle_auction');
    expect(buildCancelAuctionAction('1').type).toBe('cancel_auction');
  });
});

describe('scarces builders — offers', () => {
  it('make_offer encodes amount + optional expires_at', () => {
    expect(
      buildMakeOfferAction({
        tokenId: '1',
        amountNear: '1',
        expiresAt: '500',
      })
    ).toEqual({
      type: 'make_offer',
      token_id: '1',
      amount: '1000000000000000000000000',
      expires_at: 500,
    });
  });

  it('cancel_offer + accept_offer carry expected fields', () => {
    expect(buildCancelOfferAction('1').type).toBe('cancel_offer');
    expect(buildAcceptOfferAction('1', 'b.near')).toEqual({
      type: 'accept_offer',
      token_id: '1',
      buyer_id: 'b.near',
    });
  });

  it('collection-level offer triplet round-trips', () => {
    expect(
      buildMakeCollectionOfferAction({
        collectionId: 'g',
        amountNear: '1',
      })
    ).toEqual({
      type: 'make_collection_offer',
      collection_id: 'g',
      amount: '1000000000000000000000000',
    });
    expect(buildCancelCollectionOfferAction('g').type).toBe(
      'cancel_collection_offer'
    );
    expect(buildAcceptCollectionOfferAction('g', '1', 'b.near')).toEqual({
      type: 'accept_collection_offer',
      collection_id: 'g',
      token_id: '1',
      buyer_id: 'b.near',
    });
  });
});

describe('scarces builders — lazy', () => {
  it('create_lazy_listing flattens metadata + price + flags', () => {
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
      })
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

  it('purchase_lazy_listing carries listing_id', () => {
    expect(buildPurchaseLazyListingAction('abc')).toEqual({
      type: 'purchase_lazy_listing',
      listing_id: 'abc',
    });
  });
});
