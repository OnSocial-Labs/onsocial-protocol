import { describe, expect, it } from 'vitest';
import {
  clampSocialSpendAmountInput,
  formatSpendAmountHint,
  isValidSocialSpendAmountInput,
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

  it('validates spend amount against minimum and balance', () => {
    const minYocto = SUPPORT_PROFILE_MIN_YOCTO;
    const balanceYocto = 5_000_000_000_000_000_000n;

    expect(isValidSocialSpendAmountInput('0.001', { minYocto })).toBe(false);
    expect(isValidSocialSpendAmountInput('0.01', { minYocto })).toBe(true);
    expect(
      isValidSocialSpendAmountInput('10', { minYocto, balanceYocto })
    ).toBe(false);
    expect(isValidSocialSpendAmountInput('5', { minYocto, balanceYocto })).toBe(
      true
    );
  });

  it('formats spend hints and clamps to wallet balance', () => {
    expect(formatSpendAmountHint(SUPPORT_PROFILE_MIN_YOCTO)).toBe('0.01');
    expect(formatSpendAmountHint(0n)).toBe('0.01');

    const balanceYocto = 5_000_000_000_000_000_000n;
    expect(clampSocialSpendAmountInput('10', { balanceYocto })).toBe('5');
    expect(clampSocialSpendAmountInput('3', { balanceYocto })).toBe('3');
  });
});
