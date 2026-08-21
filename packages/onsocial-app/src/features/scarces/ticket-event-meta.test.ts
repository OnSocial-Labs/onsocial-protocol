import { describe, expect, it } from 'vitest';
import {
  mergeEventEndsIntoCollectionMetadata,
  parseTicketEventFromCollectionMetadata,
  parseTicketEventFromExtra,
} from './ticket-event-meta';
import { ticketEventScheduleFacts } from './ticket-event-facts';
import { canExtendTicketEntry } from './drop-owner-actions';

describe('ticket event metadata', () => {
  it('parses event fields from template extra', () => {
    expect(
      parseTicketEventFromExtra({
        eventStartsAt: '1700000000000',
        eventEndsAt: '1700003600000',
        place: 'Lisbon',
      })
    ).toEqual({
      eventStartsAtMs: 1_700_000_000_000,
      eventEndsAtMs: 1_700_003_600_000,
      place: 'lisbon',
    });
  });

  it('prefers collection metadata rain-day override', () => {
    expect(
      parseTicketEventFromCollectionMetadata(
        JSON.stringify({
          series: { id: 's1', title: 'Season' },
          eventEndsAt: 1_800_000_000_000,
        })
      )
    ).toEqual({ eventEndsAtMs: 1_800_000_000_000 });
  });

  it('merges event end into metadata without dropping series', () => {
    const next = mergeEventEndsIntoCollectionMetadata(
      JSON.stringify({ series: { id: 's1', title: 'Season' }, cover: { seat: 1 } }),
      1_900_000_000_000
    );
    expect(JSON.parse(next)).toEqual({
      series: { id: 's1', title: 'Season' },
      cover: { seat: 1 },
      eventEndsAt: 1_900_000_000_000,
    });
  });

  it('builds schedule facts for Facts / Door', () => {
    const facts = ticketEventScheduleFacts(
      {
        eventStartsAtMs: null,
        eventEndsAtMs: Date.now() + 86_400_000,
        place: 'lisbon',
      },
      Date.now()
    );
    expect(facts.place).toBeTruthy();
    expect(facts.ends).toBeTruthy();
    expect(facts.empty).toBe(false);
  });
});

describe('canExtendTicketEntry', () => {
  it('allows renewable ticket drops that are not cancelled', () => {
    expect(
      canExtendTicketEntry({
        kind: 'ticket',
        renewable: true,
        status: 'live',
      })
    ).toBe(true);
    expect(
      canExtendTicketEntry({
        kind: 'ticket',
        renewable: false,
        status: 'live',
      })
    ).toBe(false);
    expect(
      canExtendTicketEntry({
        kind: 'art',
        renewable: true,
        status: 'live',
      })
    ).toBe(false);
    expect(
      canExtendTicketEntry({
        kind: 'ticket',
        renewable: true,
        status: 'cancelled',
      })
    ).toBe(false);
  });
});
