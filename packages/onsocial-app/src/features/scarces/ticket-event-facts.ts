/**
 * Shared Event schedule lines for Door Event sheet + Drop Facts.
 */

import type { CollectionView } from '@/features/scarces/collections-data';
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

export function ticketEventScheduleFacts(
  view: Pick<
    CollectionView,
    'eventStartsAtMs' | 'eventEndsAtMs' | 'place'
  >,
  nowMs: number
): {
  place: string | null;
  starts: string | null;
  ends: string | null;
  next: string | null;
  empty: boolean;
} {
  const place = ticketEventPlaceLabel(view.place);
  const starts =
    view.eventStartsAtMs != null
      ? formatPageDrawerJoinedFullLabel(view.eventStartsAtMs)
      : null;
  const ends =
    view.eventEndsAtMs != null
      ? formatPageDrawerJoinedFullLabel(view.eventEndsAtMs)
      : null;

  let next: string | null = null;
  if (view.eventStartsAtMs != null && view.eventStartsAtMs > nowMs) {
    const rel = formatFutureRelativeTime(view.eventStartsAtMs, nowMs);
    next = rel ? `Starts ${rel}` : null;
  } else if (view.eventEndsAtMs != null && view.eventEndsAtMs > nowMs) {
    const rel = formatFutureRelativeTime(view.eventEndsAtMs, nowMs);
    next = rel ? `Ends ${rel}` : null;
  } else if (view.eventEndsAtMs != null && view.eventEndsAtMs <= nowMs) {
    const rel = formatMarketRelativeTime(view.eventEndsAtMs, nowMs);
    next = rel ? `Ended ${rel}` : null;
  }

  return {
    place,
    starts,
    ends,
    next,
    empty: !place && !starts && !ends,
  };
}

export function collectionHasTicketEvent(
  view: Pick<CollectionView, 'kind' | 'eventStartsAtMs' | 'eventEndsAtMs' | 'place'>
): boolean {
  if (view.kind === 'ticket') return true;
  return (
    view.eventStartsAtMs != null ||
    view.eventEndsAtMs != null ||
    Boolean(view.place?.trim())
  );
}
