import { describe, expect, it } from 'vitest';
import {
  mergeEventEndsIntoCollectionMetadata,
  parseTicketEventFromCollectionMetadata,
  parseTicketEventFromExtra,
} from './ticket-event-meta';
import {
  eventListWhenLabel,
  eventScheduleHint,
  eventScheduleLine,
  postponeNotice,
  ticketEventScheduleFacts,
} from './ticket-event-facts';
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
      eventEndsAtPreviousMs: null,
      place: 'lisbon',
    });
  });

  it('names the previous end and the end doors use now', () => {
    expect(postponeNotice(1_700_000_000_000, 1_700_000_000_000)).toBeNull();
    expect(postponeNotice(1_700_000_000_000, 1_800_000_000_000)).toContain(
      'Doors were set for'
    );
    expect(postponeNotice(1_700_000_000_000, 1_800_000_000_000)).toContain(
      'They stay open until'
    );
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
    expect(facts.starts).toBeNull();
    expect(facts.ends).toMatch(/\d:\d{2}/);
    expect(facts.when).toMatch(/Until .+\d:\d{2}/);
    expect(facts.empty).toBe(false);
  });

  it('puts the clock on the same day and both dates when the show runs over', () => {
    const start = new Date(2026, 9, 2, 20, 0).getTime();
    const sameNight = new Date(2026, 9, 2, 23, 0).getTime();
    const nextMorning = new Date(2026, 9, 3, 1, 0).getTime();
    const same = eventScheduleLine(start, sameNight);
    const over = eventScheduleLine(start, nextMorning);
    expect(same).toContain('Fri, Oct 2');
    expect(same).toContain('8:00');
    expect(same).toContain('11:00');
    expect(same).toContain('–');
    expect(over).toContain('8:00');
    expect(over).toContain('1:00');
    expect(over).toContain('–');
    expect(over).not.toContain('·');
  });

  it('keeps a relative hint for a show that is soon or on now', () => {
    const now = 1_700_000_000_000;
    expect(eventScheduleHint(now + 3 * 60 * 60 * 1000, now + 6 * 60 * 60 * 1000, now)).toMatch(
      /^Starts in /
    );
    expect(eventScheduleHint(now + 10 * 24 * 60 * 60 * 1000, now + 11 * 24 * 60 * 60 * 1000, now)).toBeNull();
    expect(eventScheduleHint(now - 60 * 60 * 1000, now + 2 * 60 * 60 * 1000, now)).toBe('On now');
  });

  it('uses a day on the list and a relative line only when the show is soon', () => {
    const now = 1_700_000_000_000;
    expect(eventListWhenLabel(now + 3 * 60 * 60 * 1000, now + 6 * 60 * 60 * 1000, now)).toMatch(
      /^Starts in /
    );
    expect(eventListWhenLabel(now - 60 * 60 * 1000, now + 2 * 60 * 60 * 1000, now)).toBe('On now');
    const later = eventListWhenLabel(
      now + 10 * 24 * 60 * 60 * 1000,
      now + 11 * 24 * 60 * 60 * 1000,
      now
    );
    expect(later).not.toMatch(/Ends in|Starts in|:/);
    expect(eventListWhenLabel(now - 10 * 24 * 60 * 60 * 1000, now - 9 * 24 * 60 * 60 * 1000, now)).not.toMatch(
      /:/
    );
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
