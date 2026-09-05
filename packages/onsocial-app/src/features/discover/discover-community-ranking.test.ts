import { describe, expect, it, vi } from 'vitest';
import {
  daoCatalogRankTier,
  hubActivityTimestamp,
  hubPeekFromMetadata,
  orderHubsByLastMove,
  isOnSocialDaoAccount,
  rankDaoCatalogEntries,
  rankHubPeeks,
} from '@/features/discover/discover-community-ranking';

describe('hubPeekFromMetadata', () => {
  it('reads name, banner, and mark from hub metadata', () => {
    expect(
      hubPeekFromMetadata(
        JSON.stringify({
          name: 'Night Market',
          image: 'https://cdn.example/mark.png',
          banner: 'https://cdn.example/banner.png',
        }),
        'night'
      )
    ).toEqual({
      title: 'Night Market',
      markUrl: 'https://cdn.example/mark.png',
      bannerUrl: 'https://cdn.example/banner.png',
    });
  });

  it('keeps a real last-activity time and drops empty clocks', () => {
    expect(hubActivityTimestamp(1_700_000_000)).toBe(1_700_000_000);
    expect(hubActivityTimestamp('0')).toBeNull();
    expect(hubActivityTimestamp(null)).toBeNull();
  });

  it('orders hubs by last move, not volume, and drops idle rows', () => {
    expect(
      orderHubsByLastMove(
        [
          { appId: 'whale', lastActivityTimestamp: 10 },
          { appId: 'fresh', lastActivityTimestamp: 90 },
          { appId: 'idle', lastActivityTimestamp: 0 },
        ],
        6
      ).map((row) => row.appId)
    ).toEqual(['fresh', 'whale']);
  });

  it('asks scarcesAppStats by last activity, not 30-day volume', async () => {
    const graphql = vi.fn().mockResolvedValue({ data: { scarcesAppStats: [] } });
    await rankHubPeeks({ query: { graphql } } as never);
    expect(graphql).toHaveBeenCalledTimes(1);
    const query = String(graphql.mock.calls[0]?.[0]?.query ?? '');
    expect(query).toContain('scarcesAppStats(');
    expect(query).toContain('lastActivityTimestamp: DESC_NULLS_LAST');
    expect(query).not.toContain('scarcesAppStatsHot');
    expect(query).not.toContain('salesVolume');
  });

  it('falls back to the hub id without metadata', () => {
    expect(hubPeekFromMetadata(null, 'studio')).toEqual({
      title: 'studio',
      bannerUrl: null,
      markUrl: null,
    });
  });
});

describe('discover community ranking', () => {
  it('detects OnSocial-hosted DAO accounts', () => {
    expect(isOnSocialDaoAccount('builders.onsocial.testnet')).toBe(true);
    expect(isOnSocialDaoAccount('guild.onsocial.near')).toBe(true);
    expect(isOnSocialDaoAccount('random.sputnikv2.testnet')).toBe(false);
  });

  it('ranks seed and OnSocial ahead of factory Near DAOs', () => {
    const ranked = rankDaoCatalogEntries(
      [
        {
          daoAccountId: 'zzz.sputnikv2.testnet',
          source: 'factory',
          listedAt: '2026-08-01T00:00:00.000Z',
        },
        {
          daoAccountId: 'alpha.onsocial.testnet',
          source: 'factory',
          listedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          daoAccountId: 'treasury.onsocial.testnet',
          source: 'seed',
          listedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      new Set(['profiled.sputnikv2.testnet'])
    );
    expect(ranked.map((row) => row.daoAccountId)).toEqual([
      'treasury.onsocial.testnet',
      'alpha.onsocial.testnet',
      'zzz.sputnikv2.testnet',
    ]);
  });

  it('promotes factory DAOs that already have OnSocial profiles', () => {
    expect(
      daoCatalogRankTier(
        { daoAccountId: 'cool.sputnikv2.testnet', source: 'factory' },
        new Set(['cool.sputnikv2.testnet'])
      )
    ).toBe(3);
    expect(
      daoCatalogRankTier(
        { daoAccountId: 'cool.sputnikv2.testnet', source: 'factory' },
        new Set()
      )
    ).toBe(4);
  });
});
