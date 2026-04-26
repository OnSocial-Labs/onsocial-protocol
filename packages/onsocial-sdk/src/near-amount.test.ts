import { describe, expect, it } from 'vitest';
import { NEAR, nearMath } from './near-amount.js';

describe('NEAR helper', () => {
  it('parses whole and fractional NEAR to yocto', () => {
    expect(NEAR('1')).toBe('1000000000000000000000000');
    expect(NEAR('0.1')).toBe('100000000000000000000000');
    expect(NEAR('0.000000000000000000000001')).toBe('1');
  });

  it('accepts already-yocto via fromYocto', () => {
    expect(NEAR.fromYocto('123')).toBe('123');
    expect(NEAR.fromYocto(456n)).toBe('456');
  });

  it('rejects negative and overflowed fractions', () => {
    expect(() => NEAR('-1')).toThrow();
    expect(() => NEAR('1.0000000000000000000000001')).toThrow();
  });

  it('roundtrips via toHuman', () => {
    expect(nearMath.toHuman(NEAR('1.5'))).toBe('1.5');
    expect(nearMath.toHuman(NEAR('1'))).toBe('1');
    expect(nearMath.toHuman(NEAR.fromYocto('0'))).toBe('0');
  });

  it('does basic arithmetic with no precision loss', () => {
    const a = NEAR('0.1');
    const b = NEAR('0.2');
    expect(nearMath.toHuman(nearMath.add(a, b))).toBe('0.3');
    expect(nearMath.gte(a, b)).toBe(false);
    expect(nearMath.gt(b, a)).toBe(true);
  });

  it('refuses negative subtraction', () => {
    expect(() => nearMath.sub(NEAR('1'), NEAR('2'))).toThrow();
  });
});
