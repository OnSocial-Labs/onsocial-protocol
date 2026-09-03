import { describe, expect, it } from 'vitest';
import {
  excludeRecommendedFromList,
  filterRecommendedPeek,
  nextDiscoverListMinHeight,
  rankStandingRecommendations,
  RECOMMENDED_MIN_SHARED,
} from './discover-recommended';
import type { ProfileListAccount } from '@/lib/profile-list-account';

function account(
  accountId: string,
  extras: Partial<ProfileListAccount> = {}
): ProfileListAccount {
  return {
    accountId,
    name: extras.name ?? accountId,
    bio: extras.bio ?? null,
    avatarUrl: extras.avatarUrl ?? null,
    kind: extras.kind ?? 'person',
    industry: extras.industry ?? null,
    openJobsCount: extras.openJobsCount ?? 0,
    standingCount: extras.standingCount ?? 0,
    standingWithCount: extras.standingWithCount ?? 0,
    mutualStandingCount: extras.mutualStandingCount ?? 0,
    endorsementsReceivedCount: extras.endorsementsReceivedCount ?? 0,
    endorsementsGivenCount: extras.endorsementsGivenCount ?? 0,
    moodId: extras.moodId ?? 'protocol',
    viewerStanding: extras.viewerStanding ?? false,
    theyStandWithViewer: extras.theyStandWithViewer ?? false,
    targetEndorsedViewer: extras.targetEndorsedViewer ?? false,
    viewerEndorsed: extras.viewerEndorsed ?? false,
  };
}

describe('rankStandingRecommendations', () => {
  it('requires two shared standers', () => {
    expect(RECOMMENDED_MIN_SHARED).toBe(2);
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['alice.near', 'bob.near'],
        friendOutgoing: [
          { accountId: 'alice.near', targetAccount: 'solo.near' },
          { accountId: 'alice.near', targetAccount: 'pair.near' },
          { accountId: 'bob.near', targetAccount: 'pair.near' },
        ],
      }).map((row) => row.accountId)
    ).toEqual(['pair.near']);
  });

  it('excludes the viewer and anyone they already stand with', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['alice.near', 'bob.near', 'cara.near'],
        friendOutgoing: [
          { accountId: 'alice.near', targetAccount: 'me.near' },
          { accountId: 'bob.near', targetAccount: 'me.near' },
          { accountId: 'alice.near', targetAccount: 'cara.near' },
          { accountId: 'bob.near', targetAccount: 'cara.near' },
          { accountId: 'alice.near', targetAccount: 'new.near' },
          { accountId: 'bob.near', targetAccount: 'new.near' },
        ],
      }).map((row) => row.accountId)
    ).toEqual(['new.near']);
  });

  it('sorts by shared standers, then first seen', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['a.near', 'b.near', 'c.near'],
        friendOutgoing: [
          { accountId: 'a.near', targetAccount: 'two.near' },
          { accountId: 'b.near', targetAccount: 'two.near' },
          { accountId: 'a.near', targetAccount: 'three.near' },
          { accountId: 'b.near', targetAccount: 'three.near' },
          { accountId: 'c.near', targetAccount: 'three.near' },
          { accountId: 'a.near', targetAccount: 'also-two.near' },
          { accountId: 'b.near', targetAccount: 'also-two.near' },
        ],
      }).map((row) => row.accountId)
    ).toEqual(['three.near', 'two.near', 'also-two.near']);
  });

  it('ignores one hop off a single popular friend', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['popular.near', 'friend.near'],
        friendOutgoing: [
          { accountId: 'popular.near', targetAccount: 'celeb-1.near' },
          { accountId: 'popular.near', targetAccount: 'celeb-2.near' },
          { accountId: 'popular.near', targetAccount: 'celeb-3.near' },
        ],
      })
    ).toEqual([]);
  });

  it('needs at least two friends before anyone can be recommended', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['only.near'],
        friendOutgoing: [
          { accountId: 'only.near', targetAccount: 'a.near' },
          { accountId: 'only.near', targetAccount: 'b.near' },
        ],
      })
    ).toEqual([]);
  });

  it('counts unique friends, not duplicate edges', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['alice.near', 'bob.near'],
        friendOutgoing: [
          { accountId: 'alice.near', targetAccount: 'new.near' },
          { accountId: 'alice.near', targetAccount: 'new.near' },
          { accountId: 'bob.near', targetAccount: 'new.near' },
        ],
      })
    ).toEqual([{ accountId: 'new.near', sharedCount: 2 }]);
  });

  it('normalizes account casing', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'Me.near',
        viewerOutgoing: ['Alice.near', 'Bob.near'],
        friendOutgoing: [
          { accountId: 'alice.near', targetAccount: 'New.near' },
          { accountId: 'BOB.near', targetAccount: 'new.near' },
        ],
      })
    ).toEqual([{ accountId: 'New.near', sharedCount: 2 }]);
  });

  it("ignores edges that are not from the viewer's friends", () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['alice.near', 'bob.near'],
        friendOutgoing: [
          { accountId: 'stranger.near', targetAccount: 'new.near' },
          { accountId: 'alice.near', targetAccount: 'new.near' },
        ],
      })
    ).toEqual([]);
  });

  it('honors the hydrate limit', () => {
    expect(
      rankStandingRecommendations({
        viewerAccountId: 'me.near',
        viewerOutgoing: ['a.near', 'b.near'],
        friendOutgoing: [
          { accountId: 'a.near', targetAccount: 'one.near' },
          { accountId: 'b.near', targetAccount: 'one.near' },
          { accountId: 'a.near', targetAccount: 'two.near' },
          { accountId: 'b.near', targetAccount: 'two.near' },
        ],
        limit: 1,
      }).map((row) => row.accountId)
    ).toEqual(['one.near']);
  });
});

describe('excludeRecommendedFromList', () => {
  it('drops shown recommended ids from the discoverScore list', () => {
    expect(
      excludeRecommendedFromList(
        [account('keep.near'), account('rec.near'), account('also.near')],
        ['rec.near']
      ).map((row) => row.accountId)
    ).toEqual(['keep.near', 'also.near']);
  });
});

describe('nextDiscoverListMinHeight', () => {
  it('locks the first measured height and only grows after that', () => {
    expect(nextDiscoverListMinHeight(null, 0)).toBeNull();
    expect(nextDiscoverListMinHeight(null, 480)).toBe(480);
    expect(nextDiscoverListMinHeight(480, 420)).toBe(480);
    expect(nextDiscoverListMinHeight(480, 520)).toBe(520);
  });
});

describe('filterRecommendedPeek', () => {
  it('applies face chips after hydrate', () => {
    const rows = [
      account('person.near', { kind: 'person' }),
      account('org.near', { kind: 'org', openJobsCount: 2 }),
      account('quiet-org.near', { kind: 'org', openJobsCount: 0 }),
    ];
    expect(
      filterRecommendedPeek(rows, 'people').map((row) => row.accountId)
    ).toEqual(['person.near']);
    expect(
      filterRecommendedPeek(rows, 'hiring').map((row) => row.accountId)
    ).toEqual(['org.near']);
  });
});
