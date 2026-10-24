import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectHeldCollectionIds,
  eventGuestCountAria,
  eventGuestCountLabel,
  eventGuestKind,
  guestRosterShouldLive,
  eventGuestSheetCopy,
  collectionGuestRoster,
  eventGuestTallyLine,
  passGuestKind,
  loadHeldCollectionIdsFrom,
  resolveEventGuestCount,
  showEventGuestCount,
  uniqueAccountIds,
} from '@/features/events/event-guests';
import {
  filterGuestRoster,
  guestRosterMatchLine,
} from '@/lib/profile-list-account';

describe('guest roster search', () => {
  const roster = [
    { accountId: 'maya.near', name: 'Maya Chen' },
    { accountId: 'alex.near', name: null },
  ];

  it('keeps everyone when the query is blank', () => {
    expect(filterGuestRoster(roster, '  ')).toEqual(roster);
  });

  it('matches a name or an account', () => {
    expect(filterGuestRoster(roster, 'chen')).toEqual([roster[0]]);
    expect(filterGuestRoster(roster, 'ALEX')).toEqual([roster[1]]);
    expect(filterGuestRoster(roster, '@alex')).toEqual([roster[1]]);
    expect(filterGuestRoster(roster, '@')).toEqual(roster);
    expect(filterGuestRoster(roster, 'nobody')).toEqual([]);
  });

  it('counts matches instead of the event while a search is on', () => {
    expect(guestRosterMatchLine(0)).toBeNull();
    expect(guestRosterMatchLine(1)).toBe('1 match');
    expect(guestRosterMatchLine(2)).toBe('2 matches');
  });

  it('names the search for each window', () => {
    expect(eventGuestSheetCopy('going').searchPlaceholder).toBe(
      'Search who’s going'
    );
    expect(eventGuestSheetCopy('in').searchPlaceholder).toBe('Search who’s in');
    expect(eventGuestSheetCopy('attended').searchPlaceholder).toBe(
      'Search who attended'
    );
    expect(
      eventGuestSheetCopy('going', { redeemed: true }).searchPlaceholder
    ).toBe('Search who has one');
    expect(
      eventGuestSheetCopy('attended', { redeemed: true }).searchPlaceholder
    ).toBe('Search who redeemed');
  });
});

describe('event guest counts', () => {
  it('names the count for each window', () => {
    expect(guestRosterShouldLive('going', true)).toBe(true);
    expect(guestRosterShouldLive('going', false)).toBe(false);
    expect(guestRosterShouldLive('in', false)).toBe(true);
    expect(guestRosterShouldLive('attended', false)).toBe(false);
    expect(eventGuestKind('now')).toBe('in');
    expect(eventGuestKind('upcoming')).toBe('going');
    expect(eventGuestKind('past')).toBe('attended');
    expect(
      passGuestKind({
        voice: 'admit',
        window: 'now',
        accessEndsAtMs: 1,
        nowMs: 10,
      })
    ).toBe('in');
    expect(
      passGuestKind({
        voice: 'redeem',
        window: 'upcoming',
        accessEndsAtMs: 50,
        nowMs: 10,
      })
    ).toBe('going');
    expect(
      passGuestKind({
        voice: 'redeem',
        window: 'upcoming',
        accessEndsAtMs: 5,
        nowMs: 10,
      })
    ).toBe('attended');
    expect(eventGuestCountLabel('going', 4, { redeemed: true })).toBe(
      '4 holding'
    );
    expect(
      collectionGuestRoster({
        kind: 'audio',
        window: 'upcoming',
        nowMs: 10,
      })
    ).toEqual({ kind: 'going', holders: true });
    for (const kind of ['art', 'writing', 'thought', 'video', 'custom', 'music']) {
      expect(
        collectionGuestRoster({ kind, window: 'past', nowMs: 10 }).holders
      ).toBe(true);
    }
    expect(
      collectionGuestRoster({
        kind: 'ticket',
        window: 'now',
        nowMs: 10,
      })
    ).toEqual({ kind: 'in', holders: false });
    expect(
      collectionGuestRoster({
        kind: 'coupon',
        window: 'upcoming',
        accessEndsAtMs: 50,
        nowMs: 10,
      })
    ).toEqual({ kind: 'going', holders: false });
    expect(
      collectionGuestRoster({
        kind: 'coupon',
        window: 'upcoming',
        accessEndsAtMs: 5,
        nowMs: 10,
      })
    ).toEqual({ kind: 'attended', holders: false });
    expect(
      collectionGuestRoster({
        kind: 'membership',
        window: 'upcoming',
        nowMs: 10,
      })
    ).toEqual({ kind: 'going', holders: true });
    expect(
      collectionGuestRoster({
        kind: 'membership',
        window: 'now',
        eventStartsAtMs: 1,
        eventEndsAtMs: 20,
        nowMs: 10,
      })
    ).toEqual({ kind: 'in', holders: false });
    expect(eventGuestCountLabel('in', 1)).toBe('1 in');
    expect(eventGuestCountLabel('in', 42)).toBe('42 in');
    expect(eventGuestCountLabel('in', 0)).toBe('0 in');
    expect(eventGuestCountLabel('going', 1)).toBe('1 going');
    expect(eventGuestCountLabel('going', 128)).toBe('128 going');
    expect(eventGuestCountLabel('attended', 1)).toBe('1 attended');
    expect(eventGuestCountLabel('attended', 186)).toBe('186 attended');
  });

  it('pairs sold with who is in, quietly', () => {
    expect(
      eventGuestTallyLine({ kind: 'in', present: 47, sold: 128 })
    ).toBe('128 sold · 47 in');
    expect(
      eventGuestTallyLine({ kind: 'in', present: 1, sold: 1 })
    ).toBe('1 sold · 1 in');
    expect(
      eventGuestTallyLine({
        kind: 'in',
        present: 12,
        sold: 40,
        redeemed: true,
      })
    ).toBe('40 sold · 12 redeemed');
    expect(
      eventGuestTallyLine({
        kind: 'going',
        present: 4,
        sold: 9,
        redeemed: true,
      })
    ).toBe('9 sold · 4 holding');
    expect(
      eventGuestTallyLine({ kind: 'attended', present: 3, sold: null })
    ).toBe('3 attended');
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

  it('pages a vault until a short page', async () => {
    const ids = await collectHeldCollectionIds(async (offset, limit) => {
      if (offset === 0) {
        return { ids: ['a', 'a', ' ', null, 'b'], fetched: limit };
      }
      return { ids: ['c'], fetched: 1 };
    });
    expect([...ids.ids]).toEqual(['a', 'b', 'c']);
    expect(ids.complete).toBe(true);
    expect(ids.nextPage).toBe(2);
  });

  it('marks a full safety cap incomplete and resumes from the next page', async () => {
    const first = await collectHeldCollectionIds(
      async (offset) => ({ ids: [`c${offset}`], fetched: 2 }),
      { pageSize: 2, maxPages: 2 }
    );
    expect(first.complete).toBe(false);
    expect(first.nextPage).toBe(2);
    expect([...first.ids]).toEqual(['c0', 'c2']);
    const rest = await collectHeldCollectionIds(
      async (offset, limit) => ({ ids: [`c${offset}`], fetched: limit - 1 }),
      { pageSize: 2, maxPages: 2, startPage: first.nextPage, into: first.ids }
    );
    expect(rest.complete).toBe(true);
    expect([...rest.ids]).toEqual(['c0', 'c2', 'c4']);
  });

  it('asks for distinct collections and falls back when the indexer rejects that', async () => {
    const queries: string[] = [];
    const ids = await loadHeldCollectionIdsFrom(async (req) => {
      queries.push(req.query);
      if (req.query.includes('distinctOn')) {
        const error = new Error('field "distinctOn" not found');
        error.name = 'GraphQLValidationError';
        throw error;
      }
      return {
        data: {
          scarcesTokenOwners: [
            { collectionId: 'ticket' },
            { collectionId: '' },
          ],
        },
      };
    }, 'ada.near');
    expect(queries.some((query) => query.includes('distinctOn'))).toBe(true);
    expect(
      queries.some((query) => query.includes('updatedBlockTimestamp'))
    ).toBe(true);
    expect([...ids.ids]).toEqual(['ticket']);
    expect(ids.complete).toBe(true);
  });

  it('does not treat a failed ticket read as an empty vault', () => {
    const panel = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'events-page-panel.tsx'),
      'utf8'
    );
    expect(panel).toContain('setHoldingsFailed(true)');
    expect(panel).toContain('Couldn’t load your tickets.');
    expect(panel).not.toContain('setHeldIds(new Set())');
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
