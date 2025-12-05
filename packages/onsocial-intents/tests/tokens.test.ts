/**
 * Tests for token utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getCurrencyAsset,
  getTokenConfig,
  formatNep141Asset,
  parseAssetId,
  isStablecoin,
  getStablecoins,
  nearToYocto,
  yoctoToNear,
  formatTokenAmount,
  formatCurrency,
  formatNear,
  parseCurrencyAmount,
  createTokenAmount,
} from '../src/tokens';

describe('Token Utilities', () => {
  describe('getCurrencyAsset', () => {
    it('should return correct asset ID for NEAR', () => {
      expect(getCurrencyAsset('NEAR')).toBe('near');
    });

    it('should return correct asset ID for USDC', () => {
      expect(getCurrencyAsset('USDC')).toBe('nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
    });

    it('should return correct asset ID for SOCIAL', () => {
      expect(getCurrencyAsset('SOCIAL')).toBe('nep141:social.tkn.near');
    });

    it('should be case-insensitive', () => {
      expect(getCurrencyAsset('usdc')).toBe('nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
      expect(getCurrencyAsset('UsDc')).toBe('nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
    });

    it('should throw for unsupported currency', () => {
      expect(() => getCurrencyAsset('INVALID')).toThrow('Unsupported currency');
    });
  });

  describe('getTokenConfig', () => {
    it('should return token config for NEAR', () => {
      const config = getTokenConfig('NEAR');
      expect(config.symbol).toBe('NEAR');
      expect(config.decimals).toBe(24);
    });

    it('should return token config for USDC', () => {
      const config = getTokenConfig('USDC');
      expect(config.symbol).toBe('USDC');
      expect(config.decimals).toBe(6);
      expect(config.isStablecoin).toBe(true);
    });
  });

  describe('formatNep141Asset', () => {
    it('should format NEP-141 asset ID', () => {
      expect(formatNep141Asset('usdc.e.near')).toBe('nep141:usdc.e.near');
      expect(formatNep141Asset('social.tkn.near')).toBe('nep141:social.tkn.near');
    });
  });

  describe('parseAssetId', () => {
    it('should parse NEAR asset ID', () => {
      expect(parseAssetId('near')).toBe('near');
    });

    it('should parse NEP-141 asset ID', () => {
      expect(parseAssetId('nep141:usdc.e.near')).toBe('usdc.e.near');
    });

    it('should parse EVM asset ID', () => {
      expect(parseAssetId('evm:0x1234')).toBe('0x1234');
    });
  });

  describe('isStablecoin', () => {
    it('should return true for stablecoins', () => {
      expect(isStablecoin('USDC')).toBe(true);
      expect(isStablecoin('USDT')).toBe(true);
      expect(isStablecoin('DAI')).toBe(true);
      expect(isStablecoin('USD')).toBe(true);
    });

    it('should return false for non-stablecoins', () => {
      expect(isStablecoin('NEAR')).toBe(false);
      expect(isStablecoin('SOCIAL')).toBe(false);
    });
  });

  describe('getStablecoins', () => {
    it('should return list of stablecoins', () => {
      const stablecoins = getStablecoins();
      expect(stablecoins).toContain('USD');
      expect(stablecoins).toContain('USDC');
      expect(stablecoins).toContain('USDT');
      expect(stablecoins).toContain('DAI');
    });
  });

  describe('nearToYocto', () => {
    it('should convert NEAR to yoctoNEAR', () => {
      expect(nearToYocto('1')).toBe('1000000000000000000000000');
      expect(nearToYocto('1.5')).toBe('1500000000000000000000000');
      expect(nearToYocto('0.1')).toBe('100000000000000000000000');
    });
  });

  describe('yoctoToNear', () => {
    it('should convert yoctoNEAR to NEAR', () => {
      expect(yoctoToNear('1000000000000000000000000')).toBe('1.0000');
      expect(yoctoToNear('1500000000000000000000000')).toBe('1.5000');
      expect(yoctoToNear('100000000000000000000000')).toBe('0.1000');
    });
  });

  describe('formatTokenAmount', () => {
    it('should format token amount with decimals', () => {
      expect(formatTokenAmount('1000000', 6)).toBe('1.0000');
      expect(formatTokenAmount('1500000', 6)).toBe('1.5000');
      expect(formatTokenAmount('100000000000000000000000', 24)).toBe('0.1000');
    });

    it('should respect maxDecimals parameter', () => {
      expect(formatTokenAmount('1500000', 6, 2)).toBe('1.50');
      expect(formatTokenAmount('1234567', 6, 2)).toBe('1.23');
    });
  });

  describe('formatCurrency', () => {
    it('should format USD with dollar sign', () => {
      expect(formatCurrency('50000000', 'USD')).toBe('$50.00');
      expect(formatCurrency('1000000', 'USD')).toBe('$1.00');
    });

    // EUR not currently configured - removed test

    it('should format NEAR with symbol', () => {
      const formatted = formatCurrency('1500000000000000000000000', 'NEAR');
      expect(formatted).toContain('1.5');
      expect(formatted).toContain('NEAR');
    });

    it('should format USDC with symbol', () => {
      expect(formatCurrency('1000000', 'USDC')).toBe('1.00 USDC');
    });
  });

  describe('formatNear', () => {
    it('should format NEAR amount', () => {
      expect(formatNear('1500000000000000000000000')).toBe('1.5000 NEAR');
      expect(formatNear('5000000000000000000000000')).toBe('5.0000 NEAR');
    });
  });

  describe('parseCurrencyAmount', () => {
    it('should parse USD amount', () => {
      expect(parseCurrencyAmount('50.00', 'USD')).toBe('50000000');
      expect(parseCurrencyAmount('1.5', 'USD')).toBe('1500000');
    });

    it('should parse NEAR amount', () => {
      expect(parseCurrencyAmount('1', 'NEAR')).toBe('1000000000000000000000000');
      expect(parseCurrencyAmount('1.5', 'NEAR')).toBe('1500000000000000000000000');
    });
  });

  describe('createTokenAmount', () => {
    it('should create TokenAmount object for USD', () => {
      const amount = createTokenAmount('50000000', 'USD');
      expect(amount.raw).toBe('50000000');
      expect(amount.formatted).toContain('50');
      expect(amount.symbol).toBe('USD');
      expect(amount.decimals).toBe(6);
    });

    it('should create TokenAmount object for NEAR', () => {
      const amount = createTokenAmount('1500000000000000000000000', 'NEAR');
      expect(amount.raw).toBe('1500000000000000000000000');
      expect(amount.formatted).toContain('1.5');
      expect(amount.symbol).toBe('NEAR');
      expect(amount.decimals).toBe(24);
    });
  });
});
