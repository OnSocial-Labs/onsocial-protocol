/**
 * Shared Event schedule lines for Door Event sheet + Drop Facts.
 */

import type { CollectionView } from '@/features/scarces/collections-data';
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';
import { formatFutureRelativeTime } from '@/features/market/market-listings';
import { normalizeSocialTimestamp } from '@onsocial/ui';
import {
  formatPageDrawerJoinedDateTimeLabel,
  formatPageDrawerJoinedFullLabel,
} from '@/lib/page-drawer-meta';

const SOON_MS = 48 * 60 * 60 * 1000;

function eventInstant(timestamp: number | null | undefined): number | null {
  if (timestamp == null) return null;
  return normalizeSocialTimestamp(timestamp);
}

function formatEventWeekday(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function formatEventDay(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function formatEventMonthDay(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function formatEventClock(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

function sameLocalDay(a: number, b: number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Calendar line for the ticket page. Clock stays here, not on the list. */
export function eventScheduleLine(
  startMs: number | null | undefined,
  endMs: number | null | undefined
): string | null {
  const start = eventInstant(startMs);
  const end = eventInstant(endMs);
  if (start && end && sameLocalDay(start, end)) {
    return `${formatEventWeekday(start)} · ${formatEventClock(start)} – ${formatEventClock(end)}`;
  }
  if (start && end) {
    return `${formatEventMonthDay(start)} – ${formatEventMonthDay(end)}`;
  }
  if (start) return `${formatEventWeekday(start)} · ${formatEventClock(start)}`;
  if (end) return `Until ${formatEventWeekday(end)} · ${formatEventClock(end)}`;
  return null;
}

/** Relative hint only while the show is soon or already on. */
export function eventScheduleHint(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
  nowMs: number
): string | null {
  const start = eventInstant(startMs);
  const end = eventInstant(endMs);
  const now = eventInstant(nowMs) ?? nowMs;
  if (start != null && start > now) {
    if (start - now >= SOON_MS) return null;
    const rel = formatFutureRelativeTime(start, now);
    return rel ? `Starts ${rel}` : null;
  }
  if (end != null && end <= now) return null;
  if (start != null || end != null) return 'On now';
  return null;
}

/** One scan line for the Events list. The clock stays on the ticket page. */
export function eventListWhenLabel(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
  nowMs: number
): string {
  const start = eventInstant(startMs);
  const end = eventInstant(endMs);
  const now = eventInstant(nowMs) ?? nowMs;
  if (end != null && end <= now) return formatEventDay(end);
  if (start != null && start > now) {
    if (start - now < SOON_MS) {
      const rel = formatFutureRelativeTime(start, now);
      if (rel) return `Starts ${rel}`;
    }
    return formatEventWeekday(start);
  }
  if (start != null && start <= now && (end == null || end > now)) return 'On now';
  if (end != null && end > now) {
    if (end - now < SOON_MS) return 'On now';
    return formatEventWeekday(end);
  }
  return 'Time to be set';
}

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
  when: string | null;
  next: string | null;
  empty: boolean;
} {
  const place = ticketEventPlaceLabel(view.place);
  const starts =
    view.eventStartsAtMs != null
      ? formatPageDrawerJoinedDateTimeLabel(view.eventStartsAtMs)
      : null;
  const ends =
    view.eventEndsAtMs != null
      ? formatPageDrawerJoinedDateTimeLabel(view.eventEndsAtMs)
      : null;
  const when = eventScheduleLine(view.eventStartsAtMs, view.eventEndsAtMs);
  const next = eventScheduleHint(
    view.eventStartsAtMs,
    view.eventEndsAtMs,
    nowMs
  );

  return {
    place,
    starts,
    ends,
    when,
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
