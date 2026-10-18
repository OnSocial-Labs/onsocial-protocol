import { describe, expect, it } from 'vitest';
import { nearToYocto } from '@/lib/app-near-rpc';
import {
  fixedSaleAskYocto,
  judgeDropAsk,
  judgeNearAsk,
  settleBuyAsk,
} from './scarce-buy-quote';

const TWO = nearToYocto('2');
const TWO_POINT_FIVE = nearToYocto('2.5');

const liveDrop = {
  price: TWO,
  remaining: 4,
  paused: false,
  cancelled: false,
  banned: false,
};

describe('fixedSaleAskYocto', () => {
  const two = nearToYocto('2');

  it('reads a native fixed sale and ignores a missing, auction, or external sale', () => {
    expect(
      fixedSaleAskYocto({
        sale_conditions: two,
        sale_type: { NativeScarce: { token_id: 's:1' } },
        auction: null,
      })
    ).toBe(two);
    expect(fixedSaleAskYocto(null)).toBeNull();
    expect(
      fixedSaleAskYocto({
        sale_conditions: two,
        sale_type: { NativeScarce: { token_id: 's:1' } },
        auction: { bid_count: 1 },
      })
    ).toBeNull();
    expect(
      fixedSaleAskYocto({
        sale_conditions: two,
        sale_type: {
          External: { scarce_contract_id: 'other.near', token_id: '1' },
        },
      })
    ).toBeNull();
  });
});

describe('judgeNearAsk', () => {
  it('opens when 2 and 2.0 are the same yocto', () => {
    expect(
      judgeNearAsk({ shownPriceNear: '2', quotedYocto: nearToYocto('2.0') })
    ).toEqual({ verdict: 'open', yocto: TWO });
  });

  it('treats a missing quote as sold', () => {
    expect(judgeNearAsk({ shownPriceNear: '2', quotedYocto: null })).toEqual({
      verdict: 'gone',
    });
    expect(judgeNearAsk({ shownPriceNear: '2', quotedYocto: '' })).toEqual({
      verdict: 'gone',
    });
  });

  it('returns the new NEAR price when the ask moved', () => {
    expect(
      judgeNearAsk({ shownPriceNear: '2', quotedYocto: TWO_POINT_FIVE })
    ).toEqual({
      verdict: 'price',
      yocto: TWO_POINT_FIVE,
      priceNear: '2.5',
    });
  });

  it('treats an unreadable shown price as a price update', () => {
    expect(judgeNearAsk({ shownPriceNear: 'soon', quotedYocto: TWO })).toEqual({
      verdict: 'price',
      yocto: TWO,
      priceNear: '2',
    });
  });

  it('keeps a free ask open', () => {
    expect(judgeNearAsk({ shownPriceNear: '', quotedYocto: '0' })).toEqual({
      verdict: 'open',
      yocto: '0',
    });
    expect(judgeNearAsk({ shownPriceNear: '0', quotedYocto: '0' })).toEqual({
      verdict: 'open',
      yocto: '0',
    });
  });
});

describe('judgeDropAsk', () => {
  it('closes a missing, empty, paused, cancelled, or banned drop', () => {
    expect(judgeDropAsk({ shownPriceNear: '2', row: null }).verdict).toBe(
      'gone'
    );
    expect(
      judgeDropAsk({
        shownPriceNear: '2',
        row: { ...liveDrop, remaining: 0 },
      }).verdict
    ).toBe('gone');
    expect(
      judgeDropAsk({
        shownPriceNear: '2',
        row: { ...liveDrop, paused: true },
      }).verdict
    ).toBe('gone');
    expect(
      judgeDropAsk({
        shownPriceNear: '2',
        row: { ...liveDrop, cancelled: true },
      }).verdict
    ).toBe('gone');
    expect(
      judgeDropAsk({
        shownPriceNear: '2',
        row: { ...liveDrop, banned: true },
      }).verdict
    ).toBe('gone');
  });

  it('opens at the same price and keeps the live remaining', () => {
    expect(judgeDropAsk({ shownPriceNear: '2.0', row: liveDrop })).toEqual({
      verdict: 'open',
      yocto: TWO,
      remaining: 4,
    });
  });

  it('prices a free drop with a null ask as zero', () => {
    expect(
      judgeDropAsk({
        shownPriceNear: '0',
        row: { ...liveDrop, price: null },
      })
    ).toEqual({ verdict: 'open', yocto: '0', remaining: 4 });
  });

  it('flattens a moved drop price for the buy sheet', () => {
    expect(
      settleBuyAsk({
        kind: 'drop',
        verdict: judgeDropAsk({
          shownPriceNear: '2',
          row: { ...liveDrop, price: TWO_POINT_FIVE, remaining: 1 },
        }),
      })
    ).toEqual({
      status: 'price',
      priceNear: '2.5',
      yocto: TWO_POINT_FIVE,
      remaining: 1,
    });
  });

  it('returns the new price and the remaining count together', () => {
    expect(
      judgeDropAsk({
        shownPriceNear: '2',
        row: { ...liveDrop, price: TWO_POINT_FIVE, remaining: 1 },
      })
    ).toEqual({
      verdict: 'price',
      yocto: TWO_POINT_FIVE,
      priceNear: '2.5',
      remaining: 1,
    });
  });
});
