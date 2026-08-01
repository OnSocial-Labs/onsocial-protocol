import { describe, expect, it } from 'vitest';
import {
  isLongerLockPeriod,
  longerLockPeriodOptions,
  resolveCurrentLockMonths,
} from '@/features/boost/boost-position';

describe('longerLockPeriodOptions', () => {
  it('excludes the current period and anything shorter', () => {
    expect(longerLockPeriodOptions(1).map((o) => o.months)).toEqual([
      6, 12, 24, 48,
    ]);
    expect(longerLockPeriodOptions(6).map((o) => o.months)).toEqual([
      12, 24, 48,
    ]);
    expect(longerLockPeriodOptions(12).map((o) => o.months)).toEqual([24, 48]);
    expect(longerLockPeriodOptions(48).map((o) => o.months)).toEqual([]);
  });

  it('ignores invalid current months', () => {
    expect(longerLockPeriodOptions(0)).toEqual([]);
    expect(longerLockPeriodOptions(undefined)).toEqual([]);
    expect(longerLockPeriodOptions(Number.NaN)).toEqual([]);
  });
});

describe('resolveCurrentLockMonths', () => {
  it('prefers the highest positive signal so a 0 cannot under-report', () => {
    expect(
      resolveCurrentLockMonths(
        { lock_months: 6 },
        { lock_months: 0, bonus_percent: 10 }
      )
    ).toBe(6);
    expect(
      resolveCurrentLockMonths(
        { lock_months: 0 },
        { lock_months: 0, bonus_percent: 10 }
      )
    ).toBe(6);
    expect(
      resolveCurrentLockMonths(
        { lock_months: 6 },
        { lock_months: 6, bonus_percent: 10 }
      )
    ).toBe(6);
  });

  it('never lets Extend see a 6mo lock as shorter than 6', () => {
    const months = resolveCurrentLockMonths(
      { lock_months: 6 },
      { lock_months: 0, bonus_percent: 10 }
    );
    expect(longerLockPeriodOptions(months).map((o) => o.months)).toEqual([
      12, 24, 48,
    ]);
  });
});

describe('isLongerLockPeriod', () => {
  it('allows only strictly longer periods', () => {
    expect(isLongerLockPeriod(6, 6)).toBe(false);
    expect(isLongerLockPeriod(1, 6)).toBe(false);
    expect(isLongerLockPeriod(12, 6)).toBe(true);
  });
});
