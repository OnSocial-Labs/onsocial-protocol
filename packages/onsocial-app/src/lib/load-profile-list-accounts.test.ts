import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProfileListAccountsCache,
  peekProfileListAccounts,
  profileListAccountsCacheKey,
} from '@/lib/load-profile-list-accounts';

afterEach(() => {
  clearProfileListAccountsCache();
});

describe('profileListAccountsCacheKey', () => {
  it('sorts ids so order does not fork the cache', () => {
    expect(
      profileListAccountsCacheKey(['b.near', 'a.near'], 'me.near')
    ).toBe(profileListAccountsCacheKey(['a.near', 'b.near'], 'me.near'));
  });

  it('scopes by viewer', () => {
    expect(profileListAccountsCacheKey(['a.near'], 'me.near')).not.toBe(
      profileListAccountsCacheKey(['a.near'], 'you.near')
    );
  });

  it('starts with an empty peek before any warm load', () => {
    expect(peekProfileListAccounts(['a.near'], 'me.near')).toBeNull();
  });
});
