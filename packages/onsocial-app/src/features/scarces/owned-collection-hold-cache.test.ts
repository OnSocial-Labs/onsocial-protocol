import { describe, expect, it } from 'vitest';
import {
  clearOwnedCollectionHold,
  peekOwnedCollectionHold,
  rememberOwnedCollectionHold,
  warmOwnedCollectionHold,
} from '@/features/scarces/owned-collection-hold-cache';

describe('owned collection hold cache', () => {
  it('seeds last-good token and settled miss for drop face open', async () => {
    clearOwnedCollectionHold();
    expect(peekOwnedCollectionHold('alice.near', 'night-drive')).toBeUndefined();
    rememberOwnedCollectionHold('alice.near', 'night-drive', 'night-drive:3');
    expect(peekOwnedCollectionHold('alice.near', 'night-drive')).toBe(
      'night-drive:3'
    );
    rememberOwnedCollectionHold('alice.near', 'night-drive', null);
    expect(peekOwnedCollectionHold('alice.near', 'night-drive')).toBe(null);

    let fetches = 0;
    warmOwnedCollectionHold('bob.near', 'chapter-one', async () => {
      fetches += 1;
      return 'chapter-one:1';
    });
    warmOwnedCollectionHold('bob.near', 'chapter-one', async () => {
      fetches += 1;
      return 'chapter-one:9';
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetches).toBe(1);
    expect(peekOwnedCollectionHold('bob.near', 'chapter-one')).toBe(
      'chapter-one:1'
    );
    clearOwnedCollectionHold();
  });
});
