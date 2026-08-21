/**
 * Access-end schedule for coupons / memberships (NEP-177 expires_at).
 * Tickets use Event instead — skip Access when Event is already shown.
 */

import type { CollectionView } from '@/features/scarces/collections-data';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';

export function accessEndsScheduleFacts(
  accessEndsAtMs: number | null | undefined,
  nowMs: number
): {
  ends: string | null;
  next: string | null;
  empty: boolean;
} {
  if (accessEndsAtMs == null || !Number.isFinite(accessEndsAtMs) || accessEndsAtMs <= 0) {
    return { ends: null, next: null, empty: true };
  }
  const ends = formatPageDrawerJoinedFullLabel(accessEndsAtMs);
  let next: string | null = null;
  if (accessEndsAtMs > nowMs) {
    const rel = formatFutureRelativeTime(accessEndsAtMs, nowMs);
    next = rel ? `Ends ${rel}` : null;
  } else {
    const rel = formatMarketRelativeTime(accessEndsAtMs, nowMs);
    next = rel ? `Ended ${rel}` : null;
  }
  return { ends, next, empty: !ends };
}

/** Show Access block when expiry is set and Event story is not already covering it. */
export function collectionShouldShowAccessEnds(
  view: Pick<
    CollectionView,
    | 'accessEndsAtMs'
    | 'eventStartsAtMs'
    | 'eventEndsAtMs'
    | 'place'
    | 'kind'
  >,
  nowMs: number
): boolean {
  if (view.accessEndsAtMs == null || view.accessEndsAtMs <= 0) return false;
  const event = ticketEventScheduleFacts(view, nowMs);
  if (!event.empty) return false;
  return true;
}
