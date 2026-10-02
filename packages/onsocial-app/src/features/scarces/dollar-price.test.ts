import { describe, expect, it } from 'vitest';
import {
  ORACLE_CALL_FEE,
  buyerMaxNear,
  dollarPurchaseDeposit,
  dollarStickerLabel,
  formatUsdE6,
  parseDollarOracle,
  parseDollarSticker,
  usdToOraclePrice,
  yoctoForUsd,
} from './dollar-price';

const ONE_NEAR = 10n ** 24n;

describe('yoctoForUsd', () => {
  it('prices two dollars at two dollars per NEAR as one NEAR', () => {
    expect(yoctoForUsd(2_000_000n, 2n, 0)).toBe(ONE_NEAR);
  });

  it('scales the oracle multiplier when the exponent is -8', () => {
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

describe('parseDollarOracle', () => {
  it('reads the oracle config', () => {
    expect(
      parseDollarOracle({
        oracle_contract: 'price-oracle.near',
        asset_id: 'wrap.near',
        max_age_seconds: 3600,
      })
    ).toEqual({
      oracleContract: 'price-oracle.near',
      assetId: 'wrap.near',
      maxAgeSeconds: 3600,
    });
  });

  it('ignores an empty view', () => {
    expect(parseDollarOracle(null)).toBeNull();
    expect(parseDollarOracle({ oracle_contract: 'price-oracle.near' })).toBeNull();
  });
});

describe('usdToOraclePrice', () => {
  it('converts decimal dollars to the oracle shape', () => {
    expect(usdToOraclePrice('4.79')).toEqual({ price: 479_000_000n, expo: -8 });
    expect(usdToOraclePrice('5')).toEqual({ price: 500_000_000n, expo: -8 });
    expect(usdToOraclePrice('0.123456789')).toEqual({
      price: 12_345_678n,
      expo: -8,
    });
  });

  it('refuses a missing or zero price', () => {
    expect(() => usdToOraclePrice('')).toThrow();
    expect(() => usdToOraclePrice('0')).toThrow();
    expect(() => usdToOraclePrice('abc')).toThrow();
  });
});

describe('dollarPurchaseDeposit', () => {
  it('adds the oracle fetch fee to the buyer maximum', () => {
    expect(dollarPurchaseDeposit(ONE_NEAR)).toBe(
      (ONE_NEAR + ORACLE_CALL_FEE).toString()
    );
  });
});
