import { describe, expect, it } from 'vitest';
import {
  formatScheduleLabel,
  toDatetimeLocalValue,
} from '@/features/scarces/drop-sale-window-sheet';
import {
  postponeEntryLead,
  saleCloseMatchesEventEnd,
} from '@/features/scarces/drop-extend-entry-panel';

const EVENT_END_MS = 1_700_000_000_000;

function closeLabel(ms: number): string {
  return formatScheduleLabel(toDatetimeLocalValue(new Date(ms)));
}

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
      `Passes stay valid until this end. The sale still closes ${closeLabel(saleMs)}.`
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
