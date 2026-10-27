/**
 * Flow-based feed windowing core — pure math, no React. Rows keep document
 * flow; far rows collapse into top/bottom spacers sized from a measured
 * height cache. The hook in `use-feed-window.ts` wires this to the DOM.
 */

/** Matches the `.home-feed-block` contain-intrinsic-size fallback (20rem). */
export const FEED_WINDOW_ESTIMATE_PX = 320;
/** Rendered slack each side of the viewport — about two mobile screens. */
export const FEED_WINDOW_OVERSCAN_PX = 1600;
/** Below this many blocks, rendering everything is cheaper than windowing. */
export const FEED_WINDOW_MIN_COUNT = 30;
/** Defensive cap on persisted height entries (session storage quota). */
export const FEED_WINDOW_SIZE_PERSIST_LIMIT = 400;

export type FeedWindowRange = { start: number; end: number };

/**
 * Measured row heights keyed by block key. Outlives range state so a row
 * scrolled away and back keeps its real height in the spacer math.
 */
export class FeedWindowSizeCache {
  private sizes = new Map<string, number>();

  get(key: string): number | undefined {
    return this.sizes.get(key);
  }

  /** True when the stored height meaningfully changed (1px threshold). */
  set(key: string, px: number): boolean {
    if (!Number.isFinite(px) || px <= 0) return false;
    const prev = this.sizes.get(key);
    if (prev !== undefined && Math.abs(prev - px) < 1) return false;
    this.sizes.set(key, px);
    return true;
  }

  /** Fill missing keys from a persisted snapshot — live measurements win. */
  prime(record: Record<string, number> | undefined): void {
    if (!record) return;
    for (const [key, value] of Object.entries(record)) {
      if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0 &&
        !this.sizes.has(key)
      ) {
        this.sizes.set(key, value);
      }
    }
  }

  toJSON(
    limit: number = FEED_WINDOW_SIZE_PERSIST_LIMIT
  ): Record<string, number> {
    const entries = [...this.sizes];
    const kept =
      entries.length > limit ? entries.slice(entries.length - limit) : entries;
    return Object.fromEntries(
      kept.map(([key, value]) => [key, Math.round(value)])
    );
  }
}

/**
 * Prefix sums: `offsets[i]` is the px top of row i, `offsets[count]` the
 * total. `sizeOf` must return a positive px height for any index.
 */
export function buildFeedWindowOffsets(
  count: number,
  sizeOf: (index: number) => number
): { offsets: number[]; total: number } {
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let i = 0; i < count; i += 1) {
    const size = sizeOf(i);
    offsets[i + 1] =
      offsets[i]! + (Number.isFinite(size) && size > 0 ? size : 0);
  }
  return { offsets, total: offsets[count] ?? 0 };
}

/**
 * Rows intersecting `[scrollTop - overscan, scrollTop + viewport + overscan]`.
 * Always returns at least one row when the list is non-empty.
 */
export function feedWindowRangeForScroll({
  offsets,
  scrollTop,
  viewportHeight,
  overscan,
}: {
  offsets: readonly number[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
}): FeedWindowRange {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0 };
  const top = Math.max(0, scrollTop - overscan);
  const bottom = scrollTop + viewportHeight + overscan;
  let start = 0;
  while (start < count - 1 && offsets[start + 1]! <= top) start += 1;
  let end = count;
  while (end > start + 1 && offsets[end - 1]! >= bottom) end -= 1;
  return { start, end };
}

/**
 * Re-anchor a range across a list mutation (prepend / re-rank / removal) so
 * the same rows stay mounted while a scroll-driven resync catches up.
 * Falls back to clamped indices when the anchored keys disappeared.
 */
export function translateFeedWindowRange(
  range: FeedWindowRange,
  prevKeys: readonly string[],
  nextKeys: readonly string[]
): FeedWindowRange {
  const count = nextKeys.length;
  if (count === 0) return { start: 0, end: 0 };
  const size = range.end - range.start;
  const startKey = prevKeys[range.start];
  const endKey = prevKeys[range.end - 1];
  const startIndex = startKey !== undefined ? nextKeys.indexOf(startKey) : -1;
  const endIndex = endKey !== undefined ? nextKeys.indexOf(endKey) : -1;
  // Both edge rows survive — span them even if a shuffle reordered them.
  if (startIndex >= 0 && endIndex >= 0) {
    return {
      start: Math.min(startIndex, endIndex),
      end: Math.max(startIndex, endIndex) + 1,
    };
  }
  if (startIndex >= 0) {
    return { start: startIndex, end: Math.min(startIndex + size, count) };
  }
  if (endIndex >= 0) {
    const end = endIndex + 1;
    return { start: Math.max(0, end - size), end };
  }
  const start = Math.min(range.start, count - 1);
  return { start, end: Math.min(Math.max(range.end, start + 1), count) };
}

/** Expand a range to include a pinned row (re-rank anchor about to move). */
export function feedWindowRangeWithPinned(
  range: FeedWindowRange,
  pinnedIndex: number
): FeedWindowRange {
  if (pinnedIndex < 0) return range;
  return {
    start: Math.min(range.start, pinnedIndex),
    end: Math.max(range.end, pinnedIndex + 1),
  };
}
