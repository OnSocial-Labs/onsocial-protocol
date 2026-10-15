import { describe, expect, it } from 'vitest';
import { dropListClock } from './drops-row-clock';

const NOW = Date.parse('2026-06-25T12:00:00.000Z');
const DAY = 86_400_000;

describe('dropListClock', () => {
  it('puts the window in the corner when the list is about that window', () => {
    expect(
      dropListClock({
        sort: 'upcoming',
        nowMs: NOW,
        createdAtMs: NOW - 4 * DAY,
        startTimeMs: NOW + 2 * DAY,
      })?.label
    ).toBe('Opens 2d');
    expect(
      dropListClock({
        sort: 'live',
        nowMs: NOW,
        createdAtMs: NOW - 4 * DAY,
        endTimeMs: NOW + 3 * 3_600_000,
      })?.label
    ).toBe('Ends 3h');
    expect(
      dropListClock({
        sort: 'closing',
        nowMs: NOW,
        endTimeMs: NOW + 4 * DAY,
      })?.label
    ).toBe('Ends 4d');
    const finished = dropListClock({
      sort: 'finished',
      nowMs: NOW,
      createdAtMs: NOW - 40 * DAY,
      endTimeMs: NOW - 10 * DAY,
    });
    expect(finished?.label.startsWith('Ended ')).toBe(true);
    expect(finished?.label).not.toMatch(/\d+d/);
    expect(finished?.atMs).toBe(NOW - 10 * DAY);
  });

  it('keeps when it appeared when the list is not about a window', () => {
    const createdAtMs = NOW - 2 * DAY;
    expect(
      dropListClock({
        sort: 'loved',
        nowMs: NOW,
        createdAtMs,
        endTimeMs: NOW + DAY,
      })
    ).toEqual({ label: '2d', atMs: createdAtMs });
    expect(
      dropListClock({
        sort: 'new',
        nowMs: NOW,
        createdAtMs,
        startTimeMs: NOW + DAY,
      })?.label
    ).toBe('2d');
  });

  it('falls back to when it appeared when the window is missing', () => {
    expect(
      dropListClock({
        sort: 'upcoming',
        nowMs: NOW,
        createdAtMs: NOW - 2 * DAY,
        startTimeMs: null,
      })?.label
    ).toBe('2d');
  });
});
