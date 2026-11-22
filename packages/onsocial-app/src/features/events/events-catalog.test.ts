import { describe, expect, it } from 'vitest';
import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import { collectionGuestRoster } from '@/features/events/event-guests';
import {
  eventMatchesMine,
  eventMatchesQuery,
  eventRowPrice,
  eventRowWhen,
  eventRowWhenAt,
  eventScanActive,
  eventWindowFor,
  groupEvents,
  scanTicketEvents,
} from '@/features/events/events-catalog';
import { eventListWhenLabel } from '@/features/scarces/ticket-event-facts';

function item(
  id: string,
  times: {
    start?: number | null;
    end?: number | null;
    saleEnd?: number | null;
    soldOut?: boolean;
    paused?: boolean;
    cancelled?: boolean;
  } = {}
): DropDiscoveryItem {
  return {
    collectionId: id,
    creatorId: 'alice.near',
    title: id,
    mediaUrl: null,
    priceNear: null,
    mintedCount: 0,
    remaining: 10,
    totalSupply: 10,
    startTimeMs: null,
    endTimeMs: times.saleEnd ?? null,
    status: 'live',
    hasAllowlist: false,
    mediumKind: 'ticket',
    hasPlayable: false,
    trackCount: null,
    description: null,
    createdAtMs: 1,
    view: {
      eventStartsAtMs: times.start ?? null,
      eventEndsAtMs: times.end ?? null,
      endTimeMs: times.saleEnd ?? null,
      place: 'lisbon',
      soldOut: Boolean(times.soldOut),
      paused: Boolean(times.paused),
      cancelled: Boolean(times.cancelled),
    } as DropDiscoveryItem['view'],
  };
}

const now = 1_000_000;

describe('event windows', () => {
  it('buckets by show time', () => {
    expect(
      eventWindowFor(item('soon', { start: now + 10, end: now + 20 }), now)
    ).toBe('upcoming');
    expect(
      eventWindowFor(item('live', { start: now - 10, end: now + 20 }), now)
    ).toBe('now');
    expect(
      eventWindowFor(item('done', { start: now - 20, end: now - 1 }), now)
    ).toBe('past');
  });

  it('orders upcoming soonest first and past latest first', () => {
    const grouped = groupEvents(
      [
        item('later', { start: now + 50, end: now + 80 }),
        item('sooner', { start: now + 5, end: now + 40 }),
        item('older', { start: now - 80, end: now - 40 }),
        item('newer', { start: now - 30, end: now - 5 }),
      ],
      now
    );
    expect(grouped.upcoming.map((row) => row.collectionId)).toEqual([
      'sooner',
      'later',
    ]);
    expect(grouped.past.map((row) => row.collectionId)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('treats a blank price as free and keeps a dollar sticker', () => {
    expect(eventRowPrice(item('free', {}))).toBe('Free');
    expect(eventRowPrice({ ...item('near', {}), priceNear: '2' })).toBe(
      '2 NEAR'
    );
    expect(eventRowPrice({ ...item('usd', {}), usdE6: '2000000' })).toBe('$2');
    expect(
      eventRowPrice({
        ...item('usd-zero', {}),
        priceNear: '0',
        usdE6: '2000000',
      })
    ).toBe('$2');
    const onView = item('usd-view', {});
    expect(
      eventRowPrice({
        ...onView,
        priceNear: '0',
        view: { ...onView.view!, usdE6: '2000000' },
      })
    ).toBe('$2');
  });

  it('matches a place or a style in one search', () => {
    const show = item('night', {});
    show.title = 'Neartopia Night';
    show.view = {
      ...show.view!,
      place: 'lisbon',
      facets: ['music'],
    } as DropDiscoveryItem['view'];
    expect(eventMatchesQuery(show, 'lisbon')).toBe(true);
    expect(eventMatchesQuery(show, 'music')).toBe(true);
    expect(eventMatchesQuery(show, 'neartopia')).toBe(true);
    expect(eventMatchesQuery(show, 'sports')).toBe(false);
  });
});

describe('closed sale with no show date', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z');
  const saleEnd = Date.parse('2026-08-17T06:30:00.000Z');
  const day = eventListWhenLabel(null, saleEnd, now);

  function guestKind(row: DropDiscoveryItem) {
    return collectionGuestRoster({
      kind: 'ticket',
      window: eventWindowFor(row, now),
      eventStartsAtMs: row.view?.eventStartsAtMs,
      eventEndsAtMs: row.view?.eventEndsAtMs,
      nowMs: now,
    }).kind;
  }

  it('returns past when the sale has ended and the show window is missing', () => {
    expect(eventWindowFor(item('onsocial-14oliw', { saleEnd }), now)).toBe(
      'past'
    );
  });

  it('labels that row with the sale-close day', () => {
    const row = item('onsocial-14oliw', { saleEnd });
    expect(day).toBe('Aug 17');
    expect(eventRowWhen(row, now)).toBe(day);
    expect(eventRowWhen(row, now)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(eventRowWhenAt(row, now)).toBe(saleEnd);
  });

  it('groups that row under past and keeps going', () => {
    const row = item('onsocial-14oliw', { saleEnd });
    const grouped = groupEvents([row], now);
    expect(grouped.past.map((entry) => entry.collectionId)).toEqual([
      'onsocial-14oliw',
    ]);
    expect(grouped.upcoming).toEqual([]);
    expect(grouped.now).toEqual([]);
    expect(guestKind(row)).toBe('going');
  });

  it('files a sold-out ended sale with no show date under past', () => {
    const row = item('sold', { saleEnd, soldOut: true });
    expect(eventWindowFor(row, now)).toBe('past');
    expect(eventRowWhen(row, now)).toBe(day);
  });

  it('files a paused ended sale with no show date under past', () => {
    const row = item('paused', { saleEnd, paused: true });
    expect(eventWindowFor(row, now)).toBe('past');
    expect(eventRowWhen(row, now)).toBe(day);
  });

  it('leaves an open unscheduled sale upcoming', () => {
    const row = item('open', { saleEnd: now + 86_400_000 });
    expect(eventWindowFor(row, now)).toBe('upcoming');
    expect(eventRowWhen(row, now)).toBe('Time to be set');
    expect(eventRowWhenAt(row, now)).toBeNull();
  });

  it('keeps a future show upcoming after the sale ends', () => {
    const row = item('later', {
      start: now + 10 * 86_400_000,
      end: now + 11 * 86_400_000,
      saleEnd,
    });
    expect(eventWindowFor(row, now)).toBe('upcoming');
    expect(eventRowWhen(row, now)).toBe(
      eventListWhenLabel(
        row.view?.eventStartsAtMs,
        row.view?.eventEndsAtMs,
        now
      )
    );
    expect(eventRowWhen(row, now)).not.toBe(day);
  });

  it('keeps a live show on now after the sale ends', () => {
    const row = item('live', {
      start: now - 3_600_000,
      end: now + 3_600_000,
      saleEnd,
    });
    expect(eventWindowFor(row, now)).toBe('now');
    expect(eventRowWhen(row, now)).toBe('On now');
  });

  it('keeps a dated past show attended', () => {
    const row = item('done', {
      start: now - 86_400_000,
      end: now - 3_600_000,
      saleEnd,
    });
    expect(eventWindowFor(row, now)).toBe('past');
    expect(guestKind(row)).toBe('attended');
  });

  it('leaves a cancelled unscheduled sale upcoming', () => {
    const row = item('cancelled', { saleEnd, cancelled: true });
    expect(eventWindowFor(row, now)).toBe('upcoming');
    expect(eventRowWhen(row, now)).toBe('Time to be set');
    expect(eventRowWhenAt(row, now)).toBeNull();
  });
});

describe('scanTicketEvents', () => {
  it('returns a match past the first page and keeps the next unread row', async () => {
    const pages = [
      [item('a', {}), item('b', {})],
      [item('night', {}), item('c', {})],
    ];
    pages[1]![0]!.title = 'Neartopia Night';
    const result = await scanTicketEvents({
      fetchPage: async (offset) => {
        const page = pages[offset / 2];
        return { items: page ?? [], hasMore: Boolean(page) && offset + 2 < 4 };
      },
      need: 1,
      match: (row) => eventMatchesQuery(row, 'neartopia'),
    });
    expect(result.matches.map((row) => row.collectionId)).toEqual(['night']);
    expect(result.seen.map((row) => row.collectionId)).toEqual([
      'a',
      'b',
      'night',
    ]);
    expect(result.nextOffset).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  it('keeps going when a tick fills its rounds on a full catalog', async () => {
    const calls: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await scanTicketEvents({
      pageSize: 2,
      maxRounds: 2,
      need: 4,
      fetchPage: async (offset) => {
        calls.push(offset);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return {
          items: [item(`a${offset}`, {}), item(`b${offset}`, {})],
          hasMore: true,
        };
      },
      match: () => false,
    });
    expect(calls).toEqual([0, 2]);
    expect(maxInFlight).toBe(2);
    expect(result.matches).toEqual([]);
    expect(result.nextOffset).toBe(4);
    expect(result.hasMore).toBe(true);
  });

  it('stops when the catalog ends with no match', async () => {
    const result = await scanTicketEvents({
      fetchPage: async () => ({ items: [item('a', {})], hasMore: false }),
      need: 48,
      match: () => false,
    });
    expect(result.matches).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBe(1);
  });

  it('is active for a search, a chip, or My events', () => {
    const idle = {
      query: '',
      styleId: null,
      placeId: null,
      hostId: null,
      heldCollectionIds: null,
    };
    expect(eventScanActive(idle)).toBe(false);
    expect(eventScanActive({ ...idle, query: 'lisbon' })).toBe(true);
    expect(eventScanActive({ ...idle, hostId: 'alice.near' })).toBe(true);
    expect(
      eventScanActive({ ...idle, heldCollectionIds: new Set(['night']) })
    ).toBe(true);
  });
});

describe('My events', () => {
  it('includes events you host and tickets you still hold', () => {
    const hosted = item('hosted', {});
    const held = item('held', {});
    held.creatorId = 'bob.near';
    const other = item('other', {});
    other.creatorId = 'bob.near';
    const heldIds = new Set(['held']);
    expect(eventMatchesMine(hosted, 'alice.near', heldIds)).toBe(true);
    expect(eventMatchesMine(held, 'alice.near', heldIds)).toBe(true);
    expect(eventMatchesMine(other, 'alice.near', heldIds)).toBe(false);
    expect(eventMatchesMine(hosted, 'alice.near', new Set())).toBe(true);
    expect(eventMatchesMine(held, 'alice.near', new Set())).toBe(false);
    expect(eventMatchesMine(other, null, null)).toBe(true);
  });
});
