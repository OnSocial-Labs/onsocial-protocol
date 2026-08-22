import { describe, expect, it } from 'vitest';
import {
  anniversaryMonthDayKeys,
  anniversaryYears,
  formatAnniversaryAction,
  isUtcLeapYear,
  profileAnniversaryDedupeKey,
  profileTimestampToMs,
  utcDateKey,
  utcMonthDayFromMs,
} from '../../src/services/notifications/profile-anniversary.js';

describe('profile anniversary helpers', () => {
  it('formats UTC date keys and leap years', () => {
    expect(utcDateKey(new Date('2026-08-22T12:00:00.000Z'))).toBe('2026-08-22');
    expect(isUtcLeapYear(2024)).toBe(true);
    expect(isUtcLeapYear(2025)).toBe(false);
    expect(isUtcLeapYear(1900)).toBe(false);
    expect(isUtcLeapYear(2000)).toBe(true);
  });

  it('celebrates Feb 29 joiners on Feb 28 in non-leap years', () => {
    expect(
      anniversaryMonthDayKeys(new Date('2025-02-28T15:00:00.000Z'))
    ).toEqual(['02-28', '02-29']);
    expect(
      anniversaryMonthDayKeys(new Date('2024-02-28T15:00:00.000Z'))
    ).toEqual(['02-28']);
    expect(
      anniversaryMonthDayKeys(new Date('2024-02-29T15:00:00.000Z'))
    ).toEqual(['02-29']);
    expect(
      anniversaryMonthDayKeys(new Date('2026-08-22T00:00:00.000Z'))
    ).toEqual(['08-22']);
  });

  it('converts profile timestamps to ms and month-day', () => {
    const ms = Date.UTC(2023, 7, 22, 12, 0, 0);
    const ns = BigInt(ms) * 1_000_000n;
    expect(profileTimestampToMs(ns)).toBe(ms);
    expect(profileTimestampToMs(String(ns))).toBe(ms);
    expect(profileTimestampToMs(ms)).toBe(ms);
    expect(utcMonthDayFromMs(ms)).toBe('08-22');
  });

  it('computes whole anniversary years and copy', () => {
    const joined = Date.UTC(2023, 7, 22);
    const now = new Date('2026-08-22T08:00:00.000Z');
    expect(anniversaryYears(joined, now)).toBe(3);
    expect(formatAnniversaryAction(1)).toBe('1 year on OnSocial');
    expect(formatAnniversaryAction(3)).toBe('3 years on OnSocial');
    expect(profileAnniversaryDedupeKey('alice.near', 2026)).toBe(
      'profile_anniversary:alice.near:2026'
    );
  });
});
