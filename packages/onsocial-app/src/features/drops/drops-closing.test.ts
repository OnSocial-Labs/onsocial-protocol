import { describe, expect, it } from 'vitest';
import {
  DROPS_CLOSING_MS,
  closingPageHasMore,
  isDropClosing,
  upcomingBucket,
} from '@/features/drops/drops-data';

describe('isDropClosing', () => {
  const now = 1_700_000_000_000;

  it('flags end within 24h', () => {
    expect(
      isDropClosing(
        {
          status: 'live',
          endTimeMs: now + DROPS_CLOSING_MS / 2,
          remaining: 50,
          totalSupply: 100,
        },
        now
      )
    ).toBe(true);
  });

  it('flags low remaining ratio', () => {
    expect(
      isDropClosing(
        {
          status: 'live',
          endTimeMs: null,
          remaining: 5,
          totalSupply: 100,
        },
        now
      )
    ).toBe(true);
  });

  it('ignores upcoming and healthy live supply', () => {
    expect(
      isDropClosing(
        {
          status: 'upcoming',
          endTimeMs: now + 60_000,
          remaining: 50,
          totalSupply: 100,
        },
        now
      )
    ).toBe(false);
    expect(
      isDropClosing(
        {
          status: 'live',
          endTimeMs: now + DROPS_CLOSING_MS * 2,
          remaining: 40,
          totalSupply: 100,
        },
        now
      )
    ).toBe(false);
  });
});

describe('closingPageHasMore', () => {
  it('pages when the merged window still has rows', () => {
    expect(
      closingPageHasMore({
        mergedCount: 40,
        offset: 0,
        limit: 24,
        pageItemCount: 24,
        liveExhausted: true,
      })
    ).toBe(true);
  });

  it('stops when the merged window is exhausted and live is done', () => {
    expect(
      closingPageHasMore({
        mergedCount: 10,
        offset: 0,
        limit: 24,
        pageItemCount: 10,
        liveExhausted: true,
      })
    ).toBe(false);
  });

  it('does not keep Show more on a short page just because live remains', () => {
    expect(
      closingPageHasMore({
        mergedCount: 3,
        offset: 0,
        limit: 24,
        pageItemCount: 3,
        liveExhausted: false,
      })
    ).toBe(false);
  });

  it('keeps paging a full page when more live rows may still close', () => {
    expect(
      closingPageHasMore({
        mergedCount: 24,
        offset: 0,
        limit: 24,
        pageItemCount: 24,
        liveExhausted: false,
      })
    ).toBe(true);
  });
});

describe('upcomingBucket', () => {
  it('buckets opens into today / week / later', () => {
    const now = Date.UTC(2026, 7, 10, 15, 0, 0);
    expect(upcomingBucket(now + 60_000, now)).toBe('today');
    expect(upcomingBucket(now + 3 * 24 * 60 * 60 * 1000, now)).toBe('week');
    expect(upcomingBucket(now + 10 * 24 * 60 * 60 * 1000, now)).toBe('later');
  });
});
