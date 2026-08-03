import { describe, expect, it } from 'vitest';
import type { ScarcesEventRow } from '@onsocial/sdk';
import {
  earningKindFromRow,
  formatEarningKindLine,
  postHrefFromSourcePath,
  saleTitleFromRow,
  scarceEarningsKindSubtotals,
  sourcePostPathFromExtra,
  type ScarceCreatorEarningRow,
} from '@/lib/scarce-creator-earnings';

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
    price: '1000000000000000000000000',
    oldPrice: null,
    newPrice: null,
    bidAmount: null,
    marketplaceFee: null,
    appPoolAmount: null,
    creatorPayment: '985000000000000000000000',
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
          creatorPayment: '98000000000000000000000',
        })
      )
    ).toBe('royalty');
  });

  it('labels primary lazy purchase as sale', () => {
    expect(earningKindFromRow(row({}))).toBe('sale');
  });
});

describe('saleTitleFromRow', () => {
  it('reads title from extraData metadata', () => {
    expect(
      saleTitleFromRow(
        row({
          extraData: JSON.stringify({
            metadata: { title: 'Hello' },
          }),
        })
      )
    ).toBe('Hello');
  });

  it('falls back to token id', () => {
    expect(saleTitleFromRow(row({ tokenId: 's:326' }))).toBe('Scarce · s:326');
  });
});

describe('formatEarningKindLine', () => {
  const base: ScarceCreatorEarningRow = {
    key: '1',
    buyerId: 'buyer.near',
    paymentYocto: '98000000000000000000000',
    title: 'Hello',
    kind: 'royalty',
    salePriceYocto: '1000000000000000000000000',
    blockTimestamp: 1,
    blockHeight: 1,
    tokenId: 's:326',
  };

  it('includes sale price context on royalty rows', () => {
    expect(formatEarningKindLine(base, '22 Jul')).toBe(
      'Royalty · Hello · of 1.00 NEAR · 22 Jul'
    );
  });

  it('keeps sale rows title + date only', () => {
    expect(
      formatEarningKindLine(
        { ...base, kind: 'sale', paymentYocto: '985000000000000000000000' },
        '20 Jul'
      )
    ).toBe('Sale · Hello · 20 Jul');
  });
});

describe('scarceEarningsKindSubtotals', () => {
  it('joins sales and royalties like Support kind totals', () => {
    expect(
      scarceEarningsKindSubtotals([
        {
          kind: 'sale',
          paymentYocto: '2500000000000000000000000',
        },
        {
          kind: 'royalty',
          paymentYocto: '620000000000000000000000',
        },
        {
          kind: 'sale',
          paymentYocto: '500000000000000000000000',
        },
      ])
    ).toBe('Sales 3.00 · Royalties 0.62');
  });

  it('omits kinds with no credit', () => {
    expect(
      scarceEarningsKindSubtotals([
        {
          kind: 'royalty',
          paymentYocto: '100000000000000000000000',
        },
      ])
    ).toBe('Royalties 0.10');
  });
});

describe('sourcePostPath / postHref', () => {
  it('reads nested sourcePost from extra', () => {
    expect(
      sourcePostPathFromExtra({
        sourcePost: {
          author: 'alice.onsocial.testnet',
          postId: '123',
        },
      })
    ).toBe('alice.onsocial.testnet/post/123');
  });

  it('builds a personal post href', () => {
    expect(
      postHrefFromSourcePath('alice.onsocial.testnet/post/123')
    ).toBe('/@alice.onsocial.testnet/posts/123');
  });
});
