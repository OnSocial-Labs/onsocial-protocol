import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/app-config', () => ({
  GOVERNANCE_DAO_ACCOUNT: 'governance.onsocial.testnet',
  TREASURY_DAO_ACCOUNT: 'treasury.onsocial.testnet',
}));

import {
  enrichStandingAccountWithDaoCatalog,
  isHeuristicDaoAccountId,
} from '@/lib/enrich-standing-with-dao';
import type { DaoCatalogLookupRow } from '@/lib/dao-catalog-lookup';

describe('enrich-standing-with-dao', () => {
  it('classifies protocol and sputnik accounts as DAOs', () => {
    expect(isHeuristicDaoAccountId('governance.onsocial.testnet')).toBe(true);
    expect(isHeuristicDaoAccountId('demo.sputnik-dao.near')).toBe(true);
    expect(isHeuristicDaoAccountId('alice.near')).toBe(false);
  });

  it('fills weak profile shells from catalog branding', () => {
    const catalog = new Map<string, DaoCatalogLookupRow>([
      [
        'guild.sputnik-dao.testnet',
        {
          daoAccountId: 'guild.sputnik-dao.testnet',
          name: 'Guild DAO',
          purpose: 'Community treasury',
          metadata: JSON.stringify({
            onsocial: {
              v: 1,
              name: 'Guild Crest',
              description: 'From metadata',
              avatar: 'ipfs://bafytestavatar',
            },
          }),
          source: 'factory',
          listedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]);

    const enriched = enrichStandingAccountWithDaoCatalog(
      {
        accountId: 'guild.sputnik-dao.testnet',
        name: null,
        bio: null,
        avatarUrl: null,
      },
      catalog
    );

    expect(enriched.isDao).toBe(true);
    expect(enriched.name).toBe('Guild DAO');
    expect(enriched.bio).toBe('Community treasury');
    expect(enriched.avatarUrl).toContain('bafytestavatar');
  });

  it('keeps existing profile fields when present', () => {
    const catalog = new Map<string, DaoCatalogLookupRow>([
      [
        'guild.sputnik-dao.testnet',
        {
          daoAccountId: 'guild.sputnik-dao.testnet',
          name: 'Catalog Name',
          purpose: 'Catalog purpose',
          metadata: null,
          source: 'factory',
          listedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]);

    const enriched = enrichStandingAccountWithDaoCatalog(
      {
        accountId: 'guild.sputnik-dao.testnet',
        name: 'Profile Name',
        bio: 'Profile bio',
        avatarUrl: 'https://cdn.example/a.png',
      },
      catalog
    );

    expect(enriched.name).toBe('Profile Name');
    expect(enriched.bio).toBe('Profile bio');
    expect(enriched.avatarUrl).toBe('https://cdn.example/a.png');
  });

  it('marks catalog hits as DAO even without sputnik suffix', () => {
    const catalog = new Map<string, DaoCatalogLookupRow>([
      [
        'custom-dao.near',
        {
          daoAccountId: 'custom-dao.near',
          name: 'Custom',
          purpose: null,
          metadata: null,
          source: 'manual',
          listedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ]);

    expect(
      enrichStandingAccountWithDaoCatalog(
        {
          accountId: 'custom-dao.near',
          name: null,
          bio: null,
          avatarUrl: null,
        },
        catalog
      ).isDao
    ).toBe(true);
  });
});
