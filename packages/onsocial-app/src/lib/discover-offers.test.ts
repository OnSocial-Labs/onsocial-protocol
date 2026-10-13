import { describe, expect, it } from 'vitest';
import { sliceOfferAccountIds, uniqueOfferAccountIds } from './discover-offers';

describe('discover offer accounts', () => {
  it('keeps the first account for each offer match', () => {
    expect(
      uniqueOfferAccountIds([
        { accountId: 'Alice.near' },
        { accountId: 'alice.near' },
        { accountId: 'bob.near' },
      ])
    ).toEqual(['Alice.near', 'bob.near']);
  });

  it('pages the account ids', () => {
    expect(sliceOfferAccountIds(['a', 'b', 'c'], 1, 1)).toEqual({
      ids: ['b'],
      hasMore: true,
    });
  });
});
