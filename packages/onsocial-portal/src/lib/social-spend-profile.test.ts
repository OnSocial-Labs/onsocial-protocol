import { describe, expect, it } from 'vitest';
import {
  parseSpendAmountYocto,
  supportPresetsAtOrAboveMin,
  SUPPORT_PROFILE_MIN_YOCTO,
} from '@/lib/social-spend-profile';

describe('social-spend-profile', () => {
  it('rejects amounts below the configured minimum', () => {
    const minYocto = 10_000_000_000_000_000_000n;

    expect(() => parseSpendAmountYocto('1', minYocto)).toThrow(
      'Minimum support is 10 SOCIAL.'
    );
    expect(parseSpendAmountYocto('10', minYocto)).toBe(minYocto);
  });

  it('uses the fallback minimum when none is provided', () => {
    expect(parseSpendAmountYocto('0.01')).toBe(SUPPORT_PROFILE_MIN_YOCTO);
  });

  it('filters preset buttons to on-chain minimum', () => {
    expect(
      supportPresetsAtOrAboveMin(10_000_000_000_000_000_000n, ['1', '5', '10'])
    ).toEqual(['10']);
  });
});
