import { describe, expect, it } from 'vitest';
import {
  postponeCloseBound,
  postponeEntryLead,
  postponeNowLine,
  postponeStartOpen,
  saleCloseMatchesEventEnd,
} from '@/features/scarces/drop-extend-entry-panel';
import { eventClockLabel } from '@/features/scarces/ticket-event-facts';

const EVENT_END_MS = 1_700_000_000_000;

describe('postpone start', () => {
  it('opens only while the original start is still ahead', () => {
    expect(postponeStartOpen(2_000, 1_000)).toBe(true);
    expect(postponeStartOpen(1_000, 1_000)).toBe(false);
    expect(postponeStartOpen(null, 1_000)).toBe(false);
  });
});

describe('postpone drums', () => {
  it('lets doors open pass the current close until a new close is chosen', () => {
    expect(postponeCloseBound('2026-10-24T20:00', '', '2026-10-24T19:00')).toBe(
      '2026-10-24T20:00'
    );
    expect(
      postponeCloseBound(
        '2026-10-24T20:00',
        '2026-10-25T20:00',
        '2026-10-24T19:00'
      )
    ).toBe('2026-10-25T20:00');
    expect(
      postponeCloseBound(
        '2026-10-25T22:00',
        '2026-10-25T20:00',
        '2026-10-24T19:00'
      )
    ).toBe('2026-10-25T22:00');
  });

  it('states the current window as one line', () => {
    const start = new Date(2026, 9, 24, 21, 32).getTime();
    const end = new Date(2026, 9, 24, 21, 45).getTime();
    expect(postponeNowLine(start, end)).toBe(
      `Now ${eventClockLabel(start)} – 9:45 PM.`
    );
    expect(postponeNowLine(null, end)).toBe(
      `Now closes ${eventClockLabel(end)}.`
    );
    expect(postponeNowLine(null, null)).toBeNull();
  });
});

describe('postpone entry lead', () => {
  it('treats a sale close in the same minute as the event end', () => {
    expect(saleCloseMatchesEventEnd(EVENT_END_MS, EVENT_END_MS)).toBe(true);
    expect(saleCloseMatchesEventEnd(EVENT_END_MS - 20_000, EVENT_END_MS)).toBe(
      true
    );
    expect(saleCloseMatchesEventEnd(EVENT_END_MS - 60_000, EVENT_END_MS)).toBe(
      false
    );
    expect(saleCloseMatchesEventEnd(null, EVENT_END_MS)).toBe(false);
    expect(saleCloseMatchesEventEnd(EVENT_END_MS, null)).toBe(false);
  });

  it('says the sale follows when the close is the event end', () => {
    expect(postponeEntryLead(EVENT_END_MS, EVENT_END_MS)).toBe(
      'The sale stays open until this new end. Passes already sold stay valid.'
    );
    expect(postponeEntryLead(EVENT_END_MS, EVENT_END_MS - 20_000)).toBe(
      'The sale stays open until this new end. Passes already sold stay valid.'
    );
  });

  it('keeps an earlier sale close on its own clock', () => {
    const saleMs = EVENT_END_MS - 60_000;
    expect(postponeEntryLead(EVENT_END_MS, saleMs)).toBe(
      `Passes stay valid until this end. The sale still closes ${eventClockLabel(saleMs)}.`
    );
  });

  it('stops a sale with no close at the new event end', () => {
    expect(postponeEntryLead(EVENT_END_MS, null)).toBe(
      'The sale stays open until this new end. Passes already sold stay valid.'
    );
    expect(postponeEntryLead(EVENT_END_MS, undefined)).toBe(
      'The sale stays open until this new end. Passes already sold stay valid.'
    );
  });
});
