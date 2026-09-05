import { describe, expect, it } from 'vitest';
import {
  daoCatalogRankTier,
  hubPeekFromMetadata,
  isOnSocialDaoAccount,
  rankDaoCatalogEntries,
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
