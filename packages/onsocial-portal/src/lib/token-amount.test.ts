import { describe, expect, it } from 'vitest';
import {
  formatSmallestTokenAmount,
  isProposerThresholdWithinBounds,
  MAX_PROPOSER_THRESHOLD_SOCIAL,
  MIN_PROPOSER_THRESHOLD_SOCIAL,
  sanitizeProposerThresholdSocialInput,
  tokenAmountToSmallestUnit,
} from '@/lib/near-rpc';

describe('token amount helpers', () => {
  it('converts human amounts to smallest units by decimals', () => {
    expect(tokenAmountToSmallestUnit('1', 24)).toBe(
      '1000000000000000000000000'
    );
    expect(tokenAmountToSmallestUnit('1.5', 6)).toBe('1500000');
    expect(tokenAmountToSmallestUnit('0.25', 18)).toBe('250000000000000000');
  });

  it('formats smallest units for display', () => {
    expect(formatSmallestTokenAmount('1000000000000000000000000', 24, 4)).toBe(
      '1'
    );
    expect(formatSmallestTokenAmount('1500000', 6, 2)).toBe('1.5');
  });

  it('bounds proposer threshold SOCIAL input', () => {
    const minYocto = tokenAmountToSmallestUnit('1', 18);
    const maxYocto = tokenAmountToSmallestUnit('10000', 18);

    expect(isProposerThresholdWithinBounds(minYocto)).toBe(true);
    expect(isProposerThresholdWithinBounds(maxYocto)).toBe(true);
    expect(isProposerThresholdWithinBounds('0')).toBe(false);
    expect(
      isProposerThresholdWithinBounds(tokenAmountToSmallestUnit('10001', 18))
    ).toBe(false);
    expect(sanitizeProposerThresholdSocialInput('15000')).toBe('10000');
    expect(MIN_PROPOSER_THRESHOLD_SOCIAL).toBe(1);
    expect(MAX_PROPOSER_THRESHOLD_SOCIAL).toBe(10_000);
  });
});
