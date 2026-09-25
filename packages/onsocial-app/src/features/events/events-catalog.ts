import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import { TICKET_EVENT_SUGGESTIONS } from '@/features/scarces/drop-facets';
import { eventListWhenLabel } from '@/features/scarces/ticket-event-facts';
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';
import { accountIdsEqual } from '@/lib/account-match';

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
  return eventListWhenLabel(
    item.view?.eventStartsAtMs ?? null,
    item.view?.eventEndsAtMs ?? null,
    nowMs
  );
}

export function eventRowPlace(item: DropDiscoveryItem): string | null {
  return ticketEventPlaceLabel(item.view?.place);
}

export function eventRowPrice(item: DropDiscoveryItem): string {
  const price = item.priceNear?.trim();
  if (!price || price === '0') return 'Free';
  return `${price} NEAR`;
}

export function eventStyleLabel(id: string): string {
  return (
    TICKET_EVENT_SUGGESTIONS.find((entry) => entry.id === id)?.label ?? id
  );
}

export function eventMatchesQuery(
  item: DropDiscoveryItem,
  needle: string
): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const place = eventRowPlace(item)?.toLowerCase() ?? '';
  const styles = (item.view?.facets ?? [])
    .map((id) => `${id} ${eventStyleLabel(id)}`.toLowerCase())
    .join(' ');
  return (
    item.title.toLowerCase().includes(q) ||
    place.includes(q) ||
    styles.includes(q)
  );
}

export function eventMatchesStyle(
  item: DropDiscoveryItem,
  styleId: string | null
): boolean {
  if (!styleId) return true;
  return (item.view?.facets ?? []).includes(styleId);
}

export function eventMatchesPlace(
  item: DropDiscoveryItem,
  place: string | null
): boolean {
  if (!place) return true;
  return item.view?.place === place;
}

export function eventMatchesHost(
  item: DropDiscoveryItem,
  hostId: string | null
): boolean {
  if (!hostId) return true;
  return accountIdsEqual(item.creatorId, hostId);
}

export type EventScan = {
  query: string;
  styleId: string | null;
  placeId: string | null;
  hostId: string | null;
};

/** True when the list must walk the ticket catalog, not the first page. */
export function eventScanActive(scan: EventScan): boolean {
  return (
    scan.query.trim().length > 0 ||
    scan.styleId != null ||
    scan.placeId != null ||
    scan.hostId != null
  );
}

export function eventMatchesScan(
  item: DropDiscoveryItem,
  scan: EventScan
): boolean {
  return (
    eventMatchesQuery(item, scan.query) &&
    eventMatchesStyle(item, scan.styleId) &&
    eventMatchesPlace(item, scan.placeId) &&
    eventMatchesHost(item, scan.hostId)
  );
}

/**
 * Walk ticket pages until `need` matches, or the catalog (or round cap) ends.
 * `nextOffset` is the next unread catalog row so More does not skip a match.
 */
export async function scanTicketEvents(opts: {
  fetchPage: (
    offset: number
  ) => Promise<{ items: DropDiscoveryItem[]; hasMore: boolean }>;
  startOffset?: number;
  need: number;
  match: (item: DropDiscoveryItem) => boolean;
  maxRounds?: number;
}): Promise<{
  matches: DropDiscoveryItem[];
  seen: DropDiscoveryItem[];
  nextOffset: number;
  hasMore: boolean;
}> {
  const maxRounds = opts.maxRounds ?? 20;
  const matches: DropDiscoveryItem[] = [];
  const seen: DropDiscoveryItem[] = [];
  let offset = opts.startOffset ?? 0;
  let hasMore = true;
  let rounds = 0;
  while (matches.length < opts.need && hasMore && rounds < maxRounds) {
    const page = await opts.fetchPage(offset);
    rounds += 1;
    if (page.items.length === 0) {
      hasMore = false;
      break;
    }
    for (let i = 0; i < page.items.length; i += 1) {
      const item = page.items[i]!;
      seen.push(item);
      if (opts.match(item)) matches.push(item);
      if (matches.length >= opts.need) {
        return {
          matches,
          seen,
          nextOffset: offset + i + 1,
          hasMore: i + 1 < page.items.length || page.hasMore,
        };
      }
    }
    offset += page.items.length;
    hasMore = page.hasMore;
  }
  return { matches, seen, nextOffset: offset, hasMore };
}

export function eventPlaceChoices(
  items: DropDiscoveryItem[]
): Array<{ id: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string }> = [];
  for (const item of items) {
    const id = item.view?.place?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: eventRowPlace(item) ?? id });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
