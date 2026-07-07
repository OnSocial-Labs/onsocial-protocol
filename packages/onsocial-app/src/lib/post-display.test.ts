import { describe, expect, it } from 'vitest';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  parsePostText,
  postTimestampIso,
} from './post-display';

describe('parsePostText', () => {
  it('reads text from schema v1 post bodies', () => {
    expect(parsePostText(JSON.stringify({ v: 1, text: 'hello world' }))).toBe(
      'hello world'
    );
  });

  it('falls back to raw value when not JSON', () => {
    expect(parsePostText('plain post')).toBe('plain post');
  });
});

describe('post timestamps', () => {
  it('formats valid second, millisecond, microsecond, and nanosecond timestamps', () => {
    const expected = new Date(1_783_220_970_000).toISOString();

    expect(postTimestampIso(1_783_220_970)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000_000)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000_000_000)).toBe(expected);
  });

  it('formats numeric timestamp strings from GraphQL bigint values', () => {
    expect(postTimestampIso('1783220970000000000')).toBe(
      new Date(1_783_220_970_000).toISOString()
    );
  });

  it('does not produce invalid ISO strings for missing timestamps', () => {
    expect(postTimestampIso(0)).toBeUndefined();
    expect(postTimestampIso(Number.NaN)).toBeUndefined();
    expect(formatPostTimestamp(0)).toBe('Unknown time');
  });
});

describe('formatRelativePostTimestamp', () => {
  const now = new Date('2026-07-07T12:00:00Z');

  it('formats sub-minute ages as now', () => {
    expect(formatRelativePostTimestamp(now.getTime() - 30_000, now)).toBe(
      'now'
    );
  });

  it('formats minute, hour, and day ages compactly', () => {
    expect(formatRelativePostTimestamp(now.getTime() - 5 * 60_000, now)).toBe(
      '5m'
    );
    expect(
      formatRelativePostTimestamp(now.getTime() - 2 * 3_600_000, now)
    ).toBe('2h');
    expect(
      formatRelativePostTimestamp(now.getTime() - 3 * 86_400_000, now)
    ).toBe('3d');
  });

  it('falls back to a short date after a week', () => {
    const formatted = formatRelativePostTimestamp(
      now.getTime() - 30 * 86_400_000,
      now
    );
    expect(formatted).not.toMatch(/^\d+[mhd]$/);
    expect(formatted).not.toContain('2026');
  });

  it('includes the year for older years', () => {
    const formatted = formatRelativePostTimestamp(
      new Date('2025-03-10T12:00:00Z').getTime(),
      now
    );
    expect(formatted).toContain('2025');
  });

  it('handles nanosecond timestamps and invalid input', () => {
    expect(
      formatRelativePostTimestamp(
        (now.getTime() - 2 * 3_600_000) * 1_000_000,
        now
      )
    ).toBe('2h');
    expect(formatRelativePostTimestamp(0, now)).toBe('Unknown time');
  });
});
