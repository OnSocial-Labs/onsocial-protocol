import { describe, expect, it } from 'vitest';
import {
  FeedWindowSizeCache,
  buildFeedWindowOffsets,
  feedWindowKeysEqual,
  feedWindowRangeForScroll,
  feedWindowRangeWithPinned,
  feedWindowScrollTopForRow,
  translateFeedWindowRange,
} from './feed-window';

describe('feedWindowKeysEqual', () => {
  it('matches same content across fresh array identities', () => {
    const a = ['x', 'y', 'z'];
    expect(feedWindowKeysEqual(a, a)).toBe(true);
    expect(feedWindowKeysEqual(a, ['x', 'y', 'z'])).toBe(true);
    expect(feedWindowKeysEqual([], [])).toBe(true);
  });

  it('detects reorder, drift, and length changes', () => {
    expect(feedWindowKeysEqual(['x', 'y'], ['y', 'x'])).toBe(false);
    expect(feedWindowKeysEqual(['x', 'y'], ['x', 'z'])).toBe(false);
    expect(feedWindowKeysEqual(['x'], ['x', 'y'])).toBe(false);
    expect(feedWindowKeysEqual(['x', 'y'], ['x'])).toBe(false);
  });
});

describe('FeedWindowSizeCache', () => {
  it('stores positive finite heights and ignores junk', () => {
    const cache = new FeedWindowSizeCache();
    expect(cache.set('a/1', 240)).toBe(true);
    expect(cache.get('a/1')).toBe(240);
    expect(cache.set('a/2', Number.NaN)).toBe(false);
    expect(cache.set('a/3', 0)).toBe(false);
    expect(cache.set('a/4', -10)).toBe(false);
    expect(cache.set('a/5', Number.POSITIVE_INFINITY)).toBe(false);
    expect(cache.get('a/2')).toBeUndefined();
  });

  it('treats sub-pixel updates as unchanged', () => {
    const cache = new FeedWindowSizeCache();
    cache.set('a/1', 240);
    expect(cache.set('a/1', 240.4)).toBe(false);
    expect(cache.set('a/1', 242)).toBe(true);
    expect(cache.get('a/1')).toBe(242);
  });

  it('primes only missing keys and serializes within the cap', () => {
    const cache = new FeedWindowSizeCache();
    cache.set('a/1', 500);
    cache.prime({ 'a/1': 100, 'a/2': 200, 'a/3': -5, 'a/4': Number.NaN });
    expect(cache.get('a/1')).toBe(500);
    expect(cache.get('a/2')).toBe(200);
    expect(cache.get('a/3')).toBeUndefined();

    const roundTrip = new FeedWindowSizeCache();
    roundTrip.prime(cache.toJSON());
    expect(roundTrip.get('a/1')).toBe(500);
    expect(roundTrip.get('a/2')).toBe(200);
  });

  it('keeps the most recent entries when over the persist cap', () => {
    const cache = new FeedWindowSizeCache();
    for (let i = 0; i < 10; i += 1) cache.set(`k/${i}`, 100 + i);
    const json = cache.toJSON(4);
    expect(Object.keys(json)).toEqual(['k/6', 'k/7', 'k/8', 'k/9']);
  });
});

describe('buildFeedWindowOffsets', () => {
  it('prefix-sums row heights', () => {
    const { offsets, total } = buildFeedWindowOffsets(
      3,
      (i) => [100, 250, 130][i]!
    );
    expect(offsets).toEqual([0, 100, 350, 480]);
    expect(total).toBe(480);
  });

  it('treats invalid sizes as zero rather than poisoning the sums', () => {
    const { offsets } = buildFeedWindowOffsets(2, (i) =>
      i === 0 ? Number.NaN : 50
    );
    expect(offsets).toEqual([0, 0, 50]);
  });
});

describe('feedWindowRangeForScroll', () => {
  // Rows: 0–99, 100–349, 350–479, 480–879.
  const { offsets } = buildFeedWindowOffsets(
    4,
    (i) => [100, 250, 130, 400][i]!
  );

  it('returns the rows intersecting the viewport plus overscan', () => {
    // Viewport 120–220 sits fully inside row 1 (100–349).
    expect(
      feedWindowRangeForScroll({
        offsets,
        scrollTop: 120,
        viewportHeight: 100,
        overscan: 0,
      })
    ).toEqual({ start: 1, end: 2 });
  });

  it('expands by the overscan on both sides', () => {
    // 0–420 reaches rows 0–2; row 3 starts at 480.
    expect(
      feedWindowRangeForScroll({
        offsets,
        scrollTop: 120,
        viewportHeight: 100,
        overscan: 200,
      })
    ).toEqual({ start: 0, end: 3 });
  });

  it('clamps at the head and keeps at least one row', () => {
    expect(
      feedWindowRangeForScroll({
        offsets,
        scrollTop: 0,
        viewportHeight: 10,
        overscan: 0,
      })
    ).toEqual({ start: 0, end: 1 });
  });

  it('clamps at the tail when scrolled past the end', () => {
    expect(
      feedWindowRangeForScroll({
        offsets,
        scrollTop: 5000,
        viewportHeight: 100,
        overscan: 0,
      })
    ).toEqual({ start: 3, end: 4 });
  });

  it('handles the empty list', () => {
    expect(
      feedWindowRangeForScroll({
        offsets: [0],
        scrollTop: 0,
        viewportHeight: 800,
        overscan: 1600,
      })
    ).toEqual({ start: 0, end: 0 });
  });
});

describe('translateFeedWindowRange', () => {
  const prev = ['a/1', 'a/2', 'a/3', 'a/4', 'a/5'];

  it('follows the same keys after a head prepend', () => {
    const next = ['new/1', 'new/2', ...prev];
    expect(translateFeedWindowRange({ start: 1, end: 3 }, prev, next)).toEqual({
      start: 3,
      end: 5,
    });
  });

  it('spans both edge rows after a re-rank shuffle', () => {
    const next = ['a/3', 'a/1', 'a/2', 'a/5', 'a/4'];
    // a/2 lands at 2, a/3 at 0 — the range spans both.
    expect(translateFeedWindowRange({ start: 1, end: 3 }, prev, next)).toEqual({
      start: 0,
      end: 3,
    });
  });

  it('keeps the range size when only one edge row survives', () => {
    const next = ['x/1', 'a/4', 'a/2', 'a/3', 'x/2'];
    expect(translateFeedWindowRange({ start: 1, end: 3 }, prev, next)).toEqual({
      start: 2,
      end: 4,
    });
  });

  it('clamps when the anchored rows were removed', () => {
    const next = ['a/4', 'a/5'];
    const translated = translateFeedWindowRange(
      { start: 1, end: 3 },
      prev,
      next
    );
    expect(translated.start).toBeLessThan(translated.end);
    expect(translated.end).toBeLessThanOrEqual(2);
  });

  it('returns an empty range for an empty list', () => {
    expect(translateFeedWindowRange({ start: 1, end: 3 }, prev, [])).toEqual({
      start: 0,
      end: 0,
    });
  });
});

describe('feedWindowRangeWithPinned', () => {
  it('expands to include a pinned row outside the window', () => {
    expect(feedWindowRangeWithPinned({ start: 4, end: 8 }, 1)).toEqual({
      start: 1,
      end: 8,
    });
    expect(feedWindowRangeWithPinned({ start: 4, end: 8 }, 12)).toEqual({
      start: 4,
      end: 13,
    });
  });

  it('is a no-op for rows already inside or no pin', () => {
    expect(feedWindowRangeWithPinned({ start: 4, end: 8 }, 6)).toEqual({
      start: 4,
      end: 8,
    });
    expect(feedWindowRangeWithPinned({ start: 4, end: 8 }, -1)).toEqual({
      start: 4,
      end: 8,
    });
  });
});

describe('feedWindowScrollTopForRow', () => {
  it('centers a row and clamps to the scroll range', () => {
    expect(
      feedWindowScrollTopForRow({
        hostTop: 100,
        rowOffset: 800,
        rowSize: 64,
        viewportHeight: 400,
        maxScroll: 2000,
      })
    ).toBe(100 + 800 - (400 - 64) / 2);
    expect(
      feedWindowScrollTopForRow({
        hostTop: 0,
        rowOffset: 0,
        rowSize: 64,
        viewportHeight: 400,
        maxScroll: 2000,
      })
    ).toBe(0);
    expect(
      feedWindowScrollTopForRow({
        hostTop: 0,
        rowOffset: 5000,
        rowSize: 64,
        viewportHeight: 400,
        maxScroll: 2000,
      })
    ).toBe(2000);
  });
});
