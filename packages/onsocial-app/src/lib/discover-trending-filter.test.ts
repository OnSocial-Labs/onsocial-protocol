import { describe, expect, it } from 'vitest';
import {
  discoverTrendingFilterQuery,
  filterTrendingDaos,
  filterTrendingProfiles,
  filterTrendingTickers,
  filterTrendingTopics,
  matchesDiscoverTrendingQuery,
} from './discover-trending-filter';
import type { ProfileListAccount } from '@/lib/profile-list-account';

describe('discover trending filter', () => {
  it('matches substrings case-insensitively', () => {
    expect(matchesDiscoverTrendingQuery('SOCIAL', 'soc')).toBe(true);
    expect(matchesDiscoverTrendingQuery('near', 'xyz')).toBe(false);
    expect(matchesDiscoverTrendingQuery('near', '')).toBe(true);
  });

  it('ignores # / $ drafts for trending peeks', () => {
    expect(discoverTrendingFilterQuery('#near')).toBe('');
    expect(discoverTrendingFilterQuery('$SOCIAL')).toBe('');
    expect(discoverTrendingFilterQuery('green')).toBe('green');
  });

  it('filters tickers and topics by needle', () => {
    expect(
      filterTrendingTickers(
        [
          { ticker: 'social', postCount: 3, lastBlock: 1 },
          { ticker: 'near', postCount: 1, lastBlock: 1 },
        ],
        'soc'
      ).map((row) => row.ticker)
    ).toEqual(['social']);

    expect(
      filterTrendingTopics(
        [
          { hashtag: 'gm', postCount: 2, lastBlock: 1 },
          { hashtag: 'near', postCount: 9, lastBlock: 1 },
        ],
        'nea'
      ).map((row) => row.hashtag)
    ).toEqual(['near']);
  });

  it('filters profiles and daos by id or name', () => {
    const profiles: ProfileListAccount[] = [
      {
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
        viewerEndorsed: false,
      },
      {
        accountId: 'bob.near',
        name: 'Green Ghost',
        avatarUrl: null,
        standingCount: 0,
        standingWithCount: 0,
        mutualStandingCount: 0,
        endorsementsReceivedCount: 0,
        endorsementsGivenCount: 0,
        viewerStanding: false,
        theyStandWithViewer: false,
        targetEndorsedViewer: false,
        viewerEndorsed: false,
      },
    ];
    expect(
      filterTrendingProfiles(profiles, 'green').map((row) => row.accountId)
    ).toEqual(['bob.near']);

    expect(
      filterTrendingProfiles(
        [
          {
            ...profiles[0],
            kind: 'person',
          },
          {
            ...profiles[1],
            kind: 'org',
            industry: 'Healthcare',
            openJobsCount: 2,
          },
        ],
        '',
        'hiring',
        'Healthcare'
      ).map((row) => row.accountId)
    ).toEqual(['bob.near']);

    expect(
      filterTrendingDaos(
        [
          { daoAccountId: 'arts.sputnik-dao.near', name: 'Arts DAO' },
          { daoAccountId: 'near.sputnik-dao.near', name: null },
        ],
        'arts'
      ).map((row) => row.daoAccountId)
    ).toEqual(['arts.sputnik-dao.near']);
  });
});
