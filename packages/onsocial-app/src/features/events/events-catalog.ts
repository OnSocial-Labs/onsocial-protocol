import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';

export type EventWindow = 'now' | 'upcoming' | 'past';

export const EVENT_WINDOW_ORDER: readonly EventWindow[] = [
  'now',
  'upcoming',
  'past',
];

export function eventWindowLabel(window: EventWindow): string {
  switch (window) {
    case 'now':
      return 'On now';
    case 'upcoming':
      return 'Upcoming';
    case 'past':
      return 'Past';
  }
}

/** Show clock. A missing window stays upcoming so the host can still find it. */
export function eventWindowFor(
  item: Pick<DropDiscoveryItem, 'view'>,
  nowMs: number
): EventWindow {
  const start = item.view?.eventStartsAtMs ?? null;
  const end = item.view?.eventEndsAtMs ?? null;
  if (end != null && end <= nowMs) return 'past';
  if (start != null && start > nowMs) return 'upcoming';
  if (end != null && end > nowMs) return 'now';
  return 'upcoming';
}

function eventSortKey(item: DropDiscoveryItem): number {
  return (
    item.view?.eventStartsAtMs ??
    item.view?.eventEndsAtMs ??
    item.createdAtMs ??
    0
  );
}

export function sortEventsInWindow(
  items: DropDiscoveryItem[],
  window: EventWindow
): DropDiscoveryItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    const delta = eventSortKey(a) - eventSortKey(b);
    return window === 'past' ? -delta : delta;
  });
  return copy;
}

export function groupEvents(
  items: DropDiscoveryItem[],
  nowMs: number
): Record<EventWindow, DropDiscoveryItem[]> {
  const grouped: Record<EventWindow, DropDiscoveryItem[]> = {
    now: [],
    upcoming: [],
    past: [],
  };
  for (const item of items) {
    grouped[eventWindowFor(item, nowMs)].push(item);
  }
  return {
    now: sortEventsInWindow(grouped.now, 'now'),
    upcoming: sortEventsInWindow(grouped.upcoming, 'upcoming'),
    past: sortEventsInWindow(grouped.past, 'past'),
  };
}

export function eventRowWhen(item: DropDiscoveryItem, nowMs: number): string {
  const facts = ticketEventScheduleFacts(
    {
      eventStartsAtMs: item.view?.eventStartsAtMs ?? null,
      eventEndsAtMs: item.view?.eventEndsAtMs ?? null,
      place: item.view?.place ?? null,
    },
    nowMs
  );
  return facts.next ?? facts.starts ?? 'Time to be set';
}

export function eventRowPlace(item: DropDiscoveryItem): string | null {
  return ticketEventPlaceLabel(item.view?.place);
}

export function eventRowPrice(item: DropDiscoveryItem): string {
  const price = item.priceNear?.trim();
  if (!price || price === '0') return 'Free';
  return `${price} NEAR`;
}
