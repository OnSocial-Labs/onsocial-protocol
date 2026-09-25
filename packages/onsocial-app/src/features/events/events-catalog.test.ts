import { describe, expect, it } from 'vitest';
import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import {
  eventRowPrice,
  eventWindowFor,
  groupEvents,
} from '@/features/events/events-catalog';

function item(
  id: string,
  times: { start?: number | null; end?: number | null }
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
    endTimeMs: null,
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
      place: 'lisbon',
    } as DropDiscoveryItem['view'],
  };
}

const now = 1_000_000;

describe('event windows', () => {
  it('buckets by show time', () => {
    expect(eventWindowFor(item('soon', { start: now + 10, end: now + 20 }), now)).toBe(
      'upcoming'
    );
    expect(eventWindowFor(item('live', { start: now - 10, end: now + 20 }), now)).toBe(
      'now'
    );
    expect(eventWindowFor(item('done', { start: now - 20, end: now - 1 }), now)).toBe(
      'past'
    );
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

  it('treats a blank price as free', () => {
    expect(eventRowPrice(item('free', {}))).toBe('Free');
  });
});
