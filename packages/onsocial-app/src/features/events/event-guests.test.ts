import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectHeldCollectionIds,
  eventGuestCountAria,
  eventGuestCountLabel,
  eventGuestKind,
  loadHeldCollectionIdsFrom,
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
