import { describe, expect, it } from 'vitest';
import {
  formatSocialCalendarTime,
  formatSocialFutureStamp,
  formatSocialRelativeTime,
  formatSocialStandingTimeMeta,
  normalizeSocialTimestamp,
} from './social-relative-time.js';

const REFERENCE_MS = Date.parse('2026-06-25T12:00:00.000Z');

describe('normalizeSocialTimestamp', () => {
  it('normalizes seconds, milliseconds, and nanoseconds', () => {
    expect(normalizeSocialTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeSocialTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(normalizeSocialTimestamp(1_700_000_000_000_000_000)).toBe(
      1_700_000_000_000
    );
  });
});

describe('formatSocialRelativeTime', () => {
  it('uses a short stamp under seven days and keeps ago in the title', () => {
    expect(formatSocialRelativeTime(REFERENCE_MS - 30_000, REFERENCE_MS)).toBe(
      'now'
    );
    expect(
      formatSocialCalendarTime(REFERENCE_MS - 30_000, REFERENCE_MS)
    ).toEqual({ label: 'now', title: 'just now' });
    expect(
      formatSocialRelativeTime(REFERENCE_MS - 2 * 60_000, REFERENCE_MS)
    ).toBe('2m');
    expect(
      formatSocialCalendarTime(REFERENCE_MS - 2 * 60_000, REFERENCE_MS)?.title
    ).toBe('2m ago');
    expect(
      formatSocialRelativeTime(REFERENCE_MS - 3 * 3_600_000, REFERENCE_MS)
    ).toBe('3h');
    expect(
      formatSocialRelativeTime(REFERENCE_MS - 4 * 86_400_000, REFERENCE_MS)
    ).toBe('4d');
    expect(
      formatSocialCalendarTime(REFERENCE_MS - 4 * 86_400_000, REFERENCE_MS)
        ?.title
    ).toBe('4d ago');
  });

  it('stops counting days after a week', () => {
    const eightDays = REFERENCE_MS - 8 * 86_400_000;
    expect(formatSocialRelativeTime(eightDays, REFERENCE_MS)).not.toMatch(/d$/);
    expect(formatSocialRelativeTime(eightDays, REFERENCE_MS)).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}$/
    );
  });

  it('shows month and day without year in the current year', () => {
    const timestamp = Date.parse('2026-03-12T10:00:00.000Z');
    expect(formatSocialRelativeTime(timestamp, REFERENCE_MS)).toBe('Mar 12');
    expect(formatSocialCalendarTime(timestamp, REFERENCE_MS)).toEqual({
      label: 'Mar 12',
      title: 'Mar 12, 2026',
    });
  });

  it('shows short year when the date is from another year', () => {
    const timestamp = Date.parse('2024-03-12T10:00:00.000Z');
    expect(formatSocialRelativeTime(timestamp, REFERENCE_MS)).toBe(
      "Mar 12 '24"
    );
    expect(formatSocialCalendarTime(timestamp, REFERENCE_MS)).toEqual({
      label: "Mar 12 '24",
      title: 'Mar 12, 2024',
    });
  });
});

describe('formatSocialFutureStamp', () => {
  it('counts forward for under a week, then a date', () => {
    expect(formatSocialFutureStamp(REFERENCE_MS, REFERENCE_MS)).toBe('soon');
    expect(
      formatSocialFutureStamp(REFERENCE_MS + 5 * 60_000, REFERENCE_MS)
    ).toBe('5m');
    expect(
      formatSocialFutureStamp(REFERENCE_MS + 3 * 3_600_000, REFERENCE_MS)
    ).toBe('3h');
    expect(
      formatSocialFutureStamp(REFERENCE_MS + 4 * 86_400_000, REFERENCE_MS)
    ).toBe('4d');
    const far = REFERENCE_MS + 40 * 86_400_000;
    expect(formatSocialFutureStamp(far, REFERENCE_MS)).toBe('Aug 4');
    expect(formatSocialFutureStamp(far, REFERENCE_MS)).not.toMatch(/d$/);
  });
});

describe('formatSocialStandingTimeMeta', () => {
  it('uses full calendar title in the description', () => {
    expect(
      formatSocialStandingTimeMeta(
        { standingSince: Date.parse('2024-03-12T10:00:00.000Z') },
        REFERENCE_MS
      )
    ).toEqual({
      label: "Mar 12 '24",
      description: 'Standing since Mar 12, 2024',
    });
  });
});
