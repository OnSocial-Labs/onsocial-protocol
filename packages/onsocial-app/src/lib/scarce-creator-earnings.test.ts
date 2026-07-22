import { describe, expect, it } from 'vitest';
import type { ScarcesEventRow } from '@onsocial/sdk';
import { earningKindFromRow } from '@/lib/scarce-creator-earnings';

function row(partial: Partial<ScarcesEventRow>): ScarcesEventRow {
  return {
    eventType: 'LAZY_LISTING_UPDATE',
    operation: 'purchased',
    author: 'buyer.near',
    blockHeight: 1,
    blockTimestamp: 1,
    tokenId: 's:1',
    collectionId: null,
    listingId: null,
    ownerId: null,
    creatorId: 'creator.near',
    buyerId: 'buyer.near',
    sellerId: null,
    bidder: null,
    accountId: null,
    appId: null,
    scarceContractId: null,
    amount: null,
    price: '1000',
    oldPrice: null,
    newPrice: null,
    bidAmount: null,
    marketplaceFee: null,
    appPoolAmount: null,
    creatorPayment: '985',
    quantity: null,
    totalSupply: null,
    reservePrice: null,
    buyNowPrice: null,
    expiresAt: null,
    reason: null,
    memo: null,
    extraData: null,
    ...partial,
  };
}

describe('earningKindFromRow', () => {
  it('labels royalty_paid as royalty', () => {
    expect(
      earningKindFromRow(
        row({
          eventType: 'SCARCE_UPDATE',
          operation: 'royalty_paid',
          sellerId: 'seller.near',
          creatorPayment: '98',
        })
      )
    ).toBe('royalty');
  });

  it('labels primary lazy purchase as sale', () => {
    expect(earningKindFromRow(row({}))).toBe('sale');
  });

  it('labels collection purchase as sale', () => {
    expect(
      earningKindFromRow(
        row({
          eventType: 'COLLECTION_UPDATE',
          operation: 'purchase',
          creatorPayment: null,
        })
      )
    ).toBe('sale');
  });
});
