import { describe, expect, it } from 'vitest';
import { parseRosterAccountIds } from '@/features/scarces/app-roster-parse';

describe('parseRosterAccountIds', () => {
  it('splits commas, spaces, and newlines', () => {
    expect(
      parseRosterAccountIds('alice.near, bob.near\ncarol.near  dave.near')
    ).toEqual(['alice.near', 'bob.near', 'carol.near', 'dave.near']);
  });

  it('dedupes and lowercases', () => {
    expect(parseRosterAccountIds('Alice.near, alice.near')).toEqual([
      'alice.near',
    ]);
  });

  it('returns empty for blank input', () => {
    expect(parseRosterAccountIds('  , \n')).toEqual([]);
  });
});
