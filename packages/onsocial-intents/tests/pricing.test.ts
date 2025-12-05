/**
 * Tests for pricing utilities
 */

import { describe, it, expect } from 'vitest';
import {
  createCurrencyPrice,
  createNearPrice,
  isCurrencySupported,
  getSupportedCurrencies,
} from '../src/pricing';

describe('Pricing Utilities', () => {
  describe('createCurrencyPrice', () => {
    it('should create Currency PriceMode', () => {
      const price = createCurrencyPrice('50000000', 'USD');
      expect(price.type).toBe('Currency');
      if (price.type === 'Currency') {
        expect(price.amount).toBe('50000000');
        expect(price.currency).toBe('USD');
      }
    });

    it('should create PriceMode for any currency', () => {
      const socialPrice = createCurrencyPrice('1000000000000000000000000', 'SOCIAL');
      expect(socialPrice.type).toBe('Currency');
      if (socialPrice.type === 'Currency') {
        expect(socialPrice.currency).toBe('SOCIAL');
      }
    });
  });

  describe('createNearPrice', () => {
    it('should create NEAR PriceMode', () => {
      const price = createNearPrice('5000000000000000000000000');
      expect(price.type).toBe('NEAR');
      if (price.type === 'NEAR') {
        expect(price.priceNear).toBe('5000000000000000000000000');
      }
    });
  });

  describe('isCurrencySupported', () => {
    it('should return true for supported currencies', () => {
      expect(isCurrencySupported('NEAR')).toBe(true);
      expect(isCurrencySupported('USD')).toBe(true);
      expect(isCurrencySupported('USDC')).toBe(true);
      expect(isCurrencySupported('SOCIAL')).toBe(true);
    });

    it('should return false for unsupported currencies', () => {
      expect(isCurrencySupported('INVALID')).toBe(false);
      expect(isCurrencySupported('BTC')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isCurrencySupported('usdc')).toBe(true);
      expect(isCurrencySupported('UsDc')).toBe(true);
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return list of supported currencies', () => {
      const currencies = getSupportedCurrencies();
      expect(currencies).toContain('NEAR');
      expect(currencies).toContain('USD');
      expect(currencies).toContain('USDC');
      expect(currencies).toContain('USDT');
      expect(currencies).toContain('SOCIAL');
      expect(currencies.length).toBeGreaterThan(5);
    });
  });
});
