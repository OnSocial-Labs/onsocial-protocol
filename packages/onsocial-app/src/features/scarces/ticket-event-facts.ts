/**
 * Shared Event schedule lines for Door Event sheet + Drop Facts.
 */

import type { CollectionView } from '@/features/scarces/collections-data';
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import {
  formatPageDrawerJoinedDateTimeLabel,
  formatPageDrawerJoinedFullLabel,
} from '@/lib/page-drawer-meta';

/** One line for a postpone: the end that moved, and the end doors use now. */
export function postponeNotice(
  previousMs: number | null | undefined,
  nextMs: number | null | undefined
): string | null {
  if (
    previousMs == null ||
    nextMs == null ||
    !Number.isFinite(previousMs) ||
    !Number.isFinite(nextMs) ||
    previousMs <= 0 ||
    nextMs <= 0 ||
    previousMs === nextMs
  ) {
    return null;
  }
  return `Doors were set for ${formatPageDrawerJoinedFullLabel(previousMs)}. They stay open until ${formatPageDrawerJoinedFullLabel(nextMs)}.`;
}

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
      ? formatPageDrawerJoinedDateTimeLabel(view.eventEndsAtMs)
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
