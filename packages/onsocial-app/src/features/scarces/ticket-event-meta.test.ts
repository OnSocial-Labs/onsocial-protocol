import { describe, expect, it } from 'vitest';
import {
  parseTicketEventFromExtra,
  ticketEventExtraFields,
} from './ticket-event-meta';

describe('ticket-event-meta', () => {
  it('parses event window and place from extra', () => {
    expect(
      parseTicketEventFromExtra({
        kind: 'ticket',
        eventStartsAt: 1_700_000_000_000,
        eventEndsAt: '1700003600000',
        place: 'ETH-Denver',
      })
    ).toEqual({
      eventStartsAtMs: 1_700_000_000_000,
      eventEndsAtMs: 1_700_003_600_000,
      place: 'eth_denver',
    });
  });

  it('builds sparse extra fields and clears empties', () => {
    expect(
      ticketEventExtraFields({
        eventStartsAtMs: 100,
        eventEndsAtMs: 200,
        place: 'Lisbon',
      })
    ).toEqual({
      eventStartsAt: 100,
      eventEndsAt: 200,
      place: 'lisbon',
    });
    expect(
      ticketEventExtraFields({
        eventStartsAtMs: null,
        eventEndsAtMs: 0,
        place: '   ',
      })
    ).toEqual({});
  });
});
