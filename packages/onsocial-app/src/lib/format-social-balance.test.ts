import { describe, expect, it } from 'vitest';
import {
  formatSocialCompact,
  yoctoToSocial,
} from '@/lib/format-social-balance';

describe('yoctoToSocial', () => {
  it('formats string and bigint yocto', () => {
    expect(yoctoToSocial('0')).toBe('0');
    expect(yoctoToSocial(0n)).toBe('0');
    expect(yoctoToSocial('1000000000000000000')).toBe('1');
    expect(yoctoToSocial(1_000_000_000_000_000_000n)).toBe('1');
    expect(yoctoToSocial('1500000000000000000')).toBe('1.5');
  });

  it('accepts Hasura NUMERIC JSON numbers without throwing', () => {
    expect(yoctoToSocial(0)).toBe('0');
    expect(yoctoToSocial(5_000)).toBe('0.000000000000005');
    expect(formatSocialCompact(5_000)).toBe('0.00');
    expect(formatSocialCompact(1_000_000_000_000_000_000)).toBe('1.00');
  });

  it('treats empty or junk as zero', () => {
    expect(yoctoToSocial(null)).toBe('0');
    expect(yoctoToSocial(undefined)).toBe('0');
    expect(yoctoToSocial('')).toBe('0');
    expect(yoctoToSocial('not-a-number')).toBe('0');
    expect(formatSocialCompact(Number.NaN)).toBe('0');
  });
});
