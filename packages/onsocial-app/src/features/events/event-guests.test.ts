import { describe, expect, it } from 'vitest';
import {
  eventGuestCountAria,
  eventGuestCountLabel,
  eventGuestKind,
  resolveEventGuestCount,
  showEventGuestCount,
  uniqueAccountIds,
} from '@/features/events/event-guests';

describe('event guest counts', () => {
  it('names the count for each window', () => {
    expect(eventGuestKind('now')).toBe('in');
    expect(eventGuestKind('upcoming')).toBe('going');
    expect(eventGuestKind('past')).toBe('attended');
    expect(eventGuestCountLabel('in', 1)).toBe('1 in');
    expect(eventGuestCountLabel('in', 42)).toBe('42 in');
    expect(eventGuestCountLabel('in', 0)).toBe('0 in');
    expect(eventGuestCountLabel('going', 1)).toBe('1 going');
    expect(eventGuestCountLabel('going', 128)).toBe('128 going');
    expect(eventGuestCountLabel('attended', 1)).toBe('1 attended');
    expect(eventGuestCountLabel('attended', 186)).toBe('186 attended');
  });

  it('uses a resolved roster, and minted passes only while holders load', () => {
    expect(
      resolveEventGuestCount('going', { mintedCount: 4, roster: undefined })
    ).toBe(4);
    expect(
      resolveEventGuestCount('going', { mintedCount: 4, roster: ['a.near'] })
    ).toBe(1);
    expect(
      resolveEventGuestCount('going', { mintedCount: 4, roster: [] })
    ).toBe(0);
    expect(
      resolveEventGuestCount('in', { mintedCount: 4, roster: undefined })
    ).toBeNull();
    expect(resolveEventGuestCount('in', { mintedCount: 4, roster: [] })).toBe(
      0
    );
    expect(
      resolveEventGuestCount('attended', { mintedCount: 2, roster: ['a.near'] })
    ).toBe(1);
  });

  it('keeps a live zero and hides empty upcoming and past counts', () => {
    expect(showEventGuestCount('in', 0)).toBe(true);
    expect(showEventGuestCount('in', null)).toBe(false);
    expect(showEventGuestCount('going', 0)).toBe(false);
    expect(showEventGuestCount('going', 3)).toBe(true);
    expect(showEventGuestCount('attended', 0)).toBe(false);
    expect(showEventGuestCount('attended', 2)).toBe(true);
  });

  it('dedupes guests and drops blanks', () => {
    expect(
      uniqueAccountIds([' ada.near ', 'ada.near', '', null, 'bo.near'])
    ).toEqual(['ada.near', 'bo.near']);
  });

  it('names the count button for the sheet it opens', () => {
    expect(eventGuestCountAria('in', '42 in')).toBe('See who’s in, 42 in');
    expect(eventGuestCountAria('going', '1 going')).toBe(
      'See who’s going, 1 going'
    );
    expect(eventGuestCountAria('attended', '2 attended')).toBe(
      'See who attended, 2 attended'
    );
  });
});
