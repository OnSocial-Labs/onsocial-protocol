import { describe, expect, it } from 'vitest';
import {
  buyerMaxNear,
  dollarStickerLabel,
  formatUsdE6,
  parseDollarSticker,
  yoctoForUsd,
} from './dollar-price';

const ONE_NEAR = 10n ** 24n;

describe('yoctoForUsd', () => {
  it('prices two dollars at two dollars per NEAR as one NEAR', () => {
    expect(yoctoForUsd(2_000_000n, 2n, 0)).toBe(ONE_NEAR);
  });

  it('scales the Pyth integer when the exponent is -8', () => {
    expect(yoctoForUsd(1_000_000n, 100_000_000n, -8)).toBe(ONE_NEAR);
  });
});

describe('buyerMaxNear', () => {
  it('allows half a percent of price movement', () => {
    expect(buyerMaxNear(1000n)).toBe(1005n);
    expect(buyerMaxNear(100n, 2)).toBe(201n);
  });
});

describe('dollarStickerLabel', () => {
  it('reads an indexed sticker and ignores a NEAR ask', () => {
    expect(dollarStickerLabel('50000000')).toBe('$50');
    expect(dollarStickerLabel('')).toBeNull();
    expect(dollarStickerLabel(null)).toBeNull();
  });
});

describe('formatUsdE6', () => {
  it('speaks a sticker in dollars', () => {
    expect(formatUsdE6(50_000_000n)).toBe('$50');
    expect(formatUsdE6(12_500_000n, 2)).toBe('$25');
  });
});

describe('parseDollarSticker', () => {
  it('reads the contract record', () => {
    expect(parseDollarSticker({ usd_e6: '50000000', min_near: '0' })).toEqual({
      usdE6: 50_000_000n,
      minNear: 0n,
    });
  });

  it('ignores an empty view', () => {
    expect(parseDollarSticker(null)).toBeNull();
  });
});
