import { describe, expect, it } from 'vitest';
import {
  boostSharePercent,
  formatBoostBoosterCount,
  formatBoostNetworkAmount,
  formatBoostSharePercent,
  formatBoostWeeklyRateBps,
  isLongerLockPeriod,
  longerLockPeriodOptions,
  previewBoostSharePercent,
  resolveCurrentLockMonths,
} from '@/features/boost/boost-position';

const SOCIAL = 10n ** 18n;

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

describe('boost share', () => {
  it('returns the percent of network influence', () => {
    expect(boostSharePercent(120n * SOCIAL, 12_000n * SOCIAL)).toBe(1);
    expect(formatBoostSharePercent(1)).toBe('1.00%');
  });

  it('hides empty share instead of 0.00%', () => {
    expect(boostSharePercent(0n, 12_000n * SOCIAL)).toBeNull();
    expect(boostSharePercent(120n * SOCIAL, 0n)).toBeNull();
    expect(formatBoostSharePercent(null)).toBe('—');
  });

  it('previews increase against the rest of the network', () => {
    expect(
      previewBoostSharePercent({
        currentEffectiveYocto: 120n * SOCIAL,
        previewEffectiveYocto: 240n * SOCIAL,
        networkTotalEffectiveYocto: 12_000n * SOCIAL,
      })
    ).toBe(1.98);
  });

  it('does not go negative when the network total is stale', () => {
    expect(
      previewBoostSharePercent({
        currentEffectiveYocto: 200n * SOCIAL,
        previewEffectiveYocto: 200n * SOCIAL,
        networkTotalEffectiveYocto: 100n * SOCIAL,
      })
    ).toBe(100);
  });
});

describe('boost network pulse labels', () => {
  it('formats locked, pool, rate, and booster count', () => {
    expect(formatBoostNetworkAmount((50_000n * SOCIAL).toString())).toBe(
      '50.0K'
    );
    expect(formatBoostNetworkAmount('0')).toBe('—');
    expect(formatBoostNetworkAmount(null)).toBe('—');
    expect(formatBoostWeeklyRateBps(125)).toBe('1.25%');
    expect(formatBoostWeeklyRateBps(null)).toBe('—');
    expect(formatBoostBoosterCount(42)).toBe('42');
    expect(formatBoostBoosterCount(null)).toBe('—');
  });
});
