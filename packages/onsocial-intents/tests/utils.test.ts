/**
 * Tests for generic token-amount utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  formatAmount,
  formatAssetId,
  parseAssetId,
  isTerminalStatus,
} from '../src/utils';

// ── parseAmount ─────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  it('converts whole NEAR (24 decimals)', () => {
    expect(parseAmount('1', 24)).toBe('1000000000000000000000000');
  });

  it('converts fractional NEAR', () => {
    expect(parseAmount('1.5', 24)).toBe('1500000000000000000000000');
    expect(parseAmount('0.1', 24)).toBe('100000000000000000000000');
  });

  it('converts whole USDC (6 decimals)', () => {
    expect(parseAmount('50', 6)).toBe('50000000');
  });

  it('converts fractional USDC', () => {
    expect(parseAmount('1.5', 6)).toBe('1500000');
  });

  it('handles zero', () => {
    expect(parseAmount('0', 6)).toBe('0');
    expect(parseAmount('0', 24)).toBe('0');
  });

  it('truncates excess fractional digits', () => {
    // 6 decimals: "1.1234567" → keep only 6 → "1123456"
    expect(parseAmount('1.1234567', 6)).toBe('1123456');
  });

  it('handles 18 decimals (ETH-style)', () => {
    expect(parseAmount('2', 18)).toBe('2000000000000000000');
  });
});

// ── formatAmount ────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  it('formats NEAR amount', () => {
    expect(formatAmount('1500000000000000000000000', 24)).toBe('1.500000');
  });

  it('formats USDC amount with 2 display decimals', () => {
    expect(formatAmount('50000000', 6, 2)).toBe('50.00');
  });

  it('formats zero', () => {
    expect(formatAmount('0', 6, 2)).toBe('0.00');
  });

  it('respects maxDisplay override', () => {
    expect(formatAmount('1500000', 6, 4)).toBe('1.5000');
  });
});

// ── formatAssetId ───────────────────────────────────────────────────────────

describe('formatAssetId', () => {
  it('builds NEP-141 asset ID', () => {
    expect(formatAssetId('nep141', 'wrap.near')).toBe('nep141:wrap.near');
  });

  it('builds EVM asset ID', () => {
    expect(formatAssetId('nep141', 'arb-0xaf88d.omft.near')).toBe(
      'nep141:arb-0xaf88d.omft.near'
    );
  });
});

// ── parseAssetId ────────────────────────────────────────────────────────────

describe('parseAssetId', () => {
  it('parses NEP-141 asset ID', () => {
    expect(parseAssetId('nep141:wrap.near')).toEqual({
      prefix: 'nep141',
      address: 'wrap.near',
    });
  });

  it('parses bare "near"', () => {
    expect(parseAssetId('near')).toEqual({ prefix: 'near', address: 'near' });
  });

  it('parses EVM asset ID', () => {
    expect(parseAssetId('evm:0x1234')).toEqual({
      prefix: 'evm',
      address: '0x1234',
    });
  });

  it('handles colons inside address', () => {
    // Only the first colon is the separator
    expect(parseAssetId('nep141:some:thing')).toEqual({
      prefix: 'nep141',
      address: 'some:thing',
    });
  });
});

// ── isTerminalStatus ────────────────────────────────────────────────────────

describe('isTerminalStatus', () => {
  it('SUCCESS is terminal', () =>
    expect(isTerminalStatus('SUCCESS')).toBe(true));
  it('FAILED is terminal', () => expect(isTerminalStatus('FAILED')).toBe(true));
  it('REFUNDED is terminal', () =>
    expect(isTerminalStatus('REFUNDED')).toBe(true));
  it('PROCESSING is not terminal', () =>
    expect(isTerminalStatus('PROCESSING')).toBe(false));
  it('PENDING_DEPOSIT is not terminal', () =>
    expect(isTerminalStatus('PENDING_DEPOSIT')).toBe(false));
});
