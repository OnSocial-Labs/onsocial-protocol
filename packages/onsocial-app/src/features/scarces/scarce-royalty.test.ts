import { describe, expect, it } from 'vitest';
import {
  buildRoyaltyMap,
  defaultRoyaltyShares,
  equalizeRoyaltyShares,
  setRoyaltySharePercent,
  validateRoyaltyShares,
} from '@/features/scarces/scarce-royalty';

describe('scarce royalty split helpers', () => {
  it('defaults to 100% for the primary account', () => {
    expect(defaultRoyaltyShares('alice.near')).toEqual([
      { accountId: 'alice.near', percent: 100 },
    ]);
    expect(defaultRoyaltyShares('')).toEqual([]);
  });

  it('equalizes shares across recipients', () => {
    expect(equalizeRoyaltyShares(['a.near', 'b.near'])).toEqual([
      { accountId: 'a.near', percent: 50 },
      { accountId: 'b.near', percent: 50 },
    ]);
    expect(equalizeRoyaltyShares(['a.near', 'b.near', 'c.near'])).toEqual([
      { accountId: 'a.near', percent: 34 },
      { accountId: 'b.near', percent: 33 },
      { accountId: 'c.near', percent: 33 },
    ]);
  });

  it('validates share totals and recipient caps', () => {
    expect(
      validateRoyaltyShares([
        { accountId: 'a.near', percent: 70 },
        { accountId: 'b.near', percent: 30 },
      ])
    ).toBeNull();
    expect(
      validateRoyaltyShares([{ accountId: 'a.near', percent: 80 }])
    ).toMatch(/100%/);
    expect(
      validateRoyaltyShares([
        { accountId: 'a.near', percent: 50 },
        { accountId: 'a.near', percent: 50 },
      ])
    ).toMatch(/Duplicate/);
  });

  it('rebalances when one share changes', () => {
    const next = setRoyaltySharePercent(
      [
        { accountId: 'a.near', percent: 50 },
        { accountId: 'b.near', percent: 50 },
      ],
      'a.near',
      70
    );
    expect(validateRoyaltyShares(next)).toBeNull();
    expect(next.find((row) => row.accountId === 'a.near')?.percent).toBe(70);
    expect(next.find((row) => row.accountId === 'b.near')?.percent).toBe(30);
  });

  it('builds an on-chain royalty map that sums to total bps', () => {
    const map = buildRoyaltyMap(1000, [
      { accountId: 'a.near', percent: 70 },
      { accountId: 'b.near', percent: 30 },
    ]);
    expect(map).toEqual({ 'a.near': 700, 'b.near': 300 });

    const rounded = buildRoyaltyMap(1000, [
      { accountId: 'a.near', percent: 34 },
      { accountId: 'b.near', percent: 33 },
      { accountId: 'c.near', percent: 33 },
    ]);
    expect(rounded).toBeTruthy();
    const sum = Object.values(rounded!).reduce((acc, bps) => acc + bps, 0);
    expect(sum).toBe(1000);
  });

  it('returns undefined for zero total or invalid shares', () => {
    expect(
      buildRoyaltyMap(0, [{ accountId: 'a.near', percent: 100 }])
    ).toBeUndefined();
    expect(
      buildRoyaltyMap(1000, [{ accountId: 'a.near', percent: 40 }])
    ).toBeUndefined();
  });
});
