import { describe, expect, it } from 'vitest';
import {
  isProfileListAccountDisplayReady,
  isStandingAccountDisplayReady,
  isStandingListCacheDisplayReady,
} from './profile-list-display';
import type { StandingListCacheEntry } from './standing-list-cache';

describe('isStandingAccountDisplayReady', () => {
  it('returns true when peer stats are present', () => {
    expect(
      isStandingAccountDisplayReady({
        accountId: 'alice.near',
        name: 'Alice',
        avatarUrl: null,
        standingCount: 0,
        standingWithCount: 0,
        mutualStandingCount: 0,
        endorsementsReceivedCount: 0,
        endorsementsGivenCount: 0,
      })
    ).toBe(true);
  });

  it('returns false for ledger-injected partial rows', () => {
    expect(
      isStandingAccountDisplayReady({
        accountId: 'bob.near',
        name: 'Bob',
        avatarUrl: null,
        viewerStanding: true,
      })
    ).toBe(false);
  });
});

describe('isProfileListAccountDisplayReady', () => {
  it('treats rows without rowHydrated as ready', () => {
    expect(
      isProfileListAccountDisplayReady({
        accountId: 'alice.near',
        name: 'Alice',
        avatarUrl: null,
        standingCount: 0,
        standingWithCount: 0,
        mutualStandingCount: 0,
        endorsementsReceivedCount: 0,
        endorsementsGivenCount: 0,
        viewerStanding: false,
        theyStandWithViewer: false,
        targetEndorsedViewer: false,
      })
    ).toBe(true);
  });

  it('returns false when rowHydrated is false', () => {
    expect(
      isProfileListAccountDisplayReady({
        accountId: 'bob.near',
        name: 'Bob',
        avatarUrl: null,
        standingCount: 0,
        standingWithCount: 0,
        mutualStandingCount: 0,
        endorsementsReceivedCount: 0,
        endorsementsGivenCount: 0,
        viewerStanding: false,
        theyStandWithViewer: false,
        targetEndorsedViewer: false,
        rowHydrated: false,
      })
    ).toBe(false);
  });
});

describe('isStandingListCacheDisplayReady', () => {
  const entry: StandingListCacheEntry = {
    viewerAccountId: 'viewer.near',
    accounts: [
      {
        accountId: 'alice.near',
        name: 'Alice',
        avatarUrl: null,
        standingCount: 1,
        standingWithCount: 1,
        mutualStandingCount: 0,
        endorsementsReceivedCount: 0,
        endorsementsGivenCount: 0,
      },
    ],
    listTotal: 1,
    hasMore: false,
  };

  it('requires matching viewer context', () => {
    expect(isStandingListCacheDisplayReady(entry, 'viewer.near')).toBe(true);
    expect(isStandingListCacheDisplayReady(entry, null)).toBe(false);
    expect(isStandingListCacheDisplayReady(entry, 'other.near')).toBe(false);
  });
});
