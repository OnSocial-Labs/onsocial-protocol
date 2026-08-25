import { describe, expect, it } from 'vitest';
import {
  formatAbsoluteDmTime,
  formatRelativeDmTime,
  parseDmDate,
} from './dm-time';

describe('parseDmDate', () => {
  it('reads ISO timestamps and rejects junk', () => {
    expect(parseDmDate('2026-08-24T12:00:00.000Z')?.toISOString()).toBe(
      '2026-08-24T12:00:00.000Z'
    );
    expect(parseDmDate('')).toBeNull();
    expect(parseDmDate('not-a-date')).toBeNull();
  });
});

describe('formatRelativeDmTime', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');

  it('uses feed-style compact ages', () => {
    expect(formatRelativeDmTime(now.toISOString(), now)).toBe('now');
    expect(
      formatRelativeDmTime(
        new Date(now.getTime() - 5 * 60_000).toISOString(),
        now
      )
    ).toBe('5m');
    expect(
      formatRelativeDmTime(
        new Date(now.getTime() - 2 * 3_600_000).toISOString(),
        now
      )
    ).toBe('2h');
    expect(
      formatRelativeDmTime(
        new Date(now.getTime() - 3 * 86_400_000).toISOString(),
        now
      )
    ).toBe('3d');
  });

  it('returns empty for invalid input', () => {
    expect(formatRelativeDmTime('nope', now)).toBe('');
  });
});

describe('formatAbsoluteDmTime', () => {
  it('formats a readable absolute time', () => {
    const label = formatAbsoluteDmTime('2026-08-24T15:04:00.000Z');
    expect(label).toMatch(/Aug/);
    expect(label).toMatch(/2026/);
  });
});
