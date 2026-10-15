import { formatSocialFutureStamp } from '@onsocial/ui';
import type { DropsSort } from '@/features/drops/drops-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';

export type DropListClock = {
  label: string;
  atMs: number;
};

/** Opens / Ends / Ended for a drop window. Empty when the instant is missing. */
export function formatDropWindow(
  ms: number,
  kind: 'opens' | 'ends',
  nowMs: number
): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (kind === 'ends' && ms <= nowMs) {
    const rel = formatMarketRelativeTime(ms, nowMs);
    return rel ? `Ended ${rel}` : 'Ended';
  }
  const rel = formatSocialFutureStamp(ms, nowMs);
  if (!rel) return '';
  if (rel === 'soon') return kind === 'opens' ? 'Opens soon' : 'Ends soon';
  return kind === 'opens' ? `Opens ${rel}` : `Ends ${rel}`;
}

function createdClock(
  createdAtMs: number | null | undefined,
  nowMs: number
): DropListClock | null {
  if (
    createdAtMs == null ||
    !Number.isFinite(createdAtMs) ||
    createdAtMs <= 0
  ) {
    return null;
  }
  const label = formatMarketRelativeTime(createdAtMs, nowMs);
  return label ? { label, atMs: createdAtMs } : null;
}

function windowClock(
  ms: number | null | undefined,
  kind: 'opens' | 'ends',
  nowMs: number
): DropListClock | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const label = formatDropWindow(ms, kind, nowMs);
  return label ? { label, atMs: ms } : null;
}

/**
 * The one clock in the drop row corner.
 * Upcoming, live, closing, and finished use the window.
 * Loved, traded, new, and saved use when it appeared.
 */
export function dropListClock(input: {
  sort: DropsSort;
  nowMs: number;
  createdAtMs?: number | null;
  startTimeMs?: number | null;
  endTimeMs?: number | null;
}): DropListClock | null {
  const created = createdClock(input.createdAtMs, input.nowMs);
  if (input.sort === 'upcoming') {
    return windowClock(input.startTimeMs, 'opens', input.nowMs) ?? created;
  }
  if (
    input.sort === 'live' ||
    input.sort === 'closing' ||
    input.sort === 'finished'
  ) {
    return windowClock(input.endTimeMs, 'ends', input.nowMs) ?? created;
  }
  return created;
}
