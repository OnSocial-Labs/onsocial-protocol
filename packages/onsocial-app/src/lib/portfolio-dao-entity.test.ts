import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/app-config', () => ({
  GOVERNANCE_DAO_ACCOUNT: 'governance.onsocial.testnet',
  TREASURY_DAO_ACCOUNT: 'treasury.onsocial.testnet',
}));

vi.mock('@/lib/dao-catalog-lookup', () => ({
  lookupDaoCatalogByIds: vi.fn(async () => new Map()),
  lookupDaoCatalogById: vi.fn(async () => null),
  fetchDaoPortfolioPageBundle: vi.fn(async () => ({ dao: null, profile: null })),
}));

vi.mock('@/features/protocol/protocol-eligibility', () => ({
  getProtocolDaoConfig: vi.fn(async () => null),
}));

import { fetchDaoPortfolioPageBundle } from '@/lib/dao-catalog-lookup';
import {
  isProtocolFacePairDao,
  isProtocolGovernanceFace,
  resolvePortfolioDaoEntity,
} from './portfolio-dao-entity';

describe('protocol face pair helpers', () => {
  it('detects governance / treasury pair faces', () => {
    expect(isProtocolFacePairDao('governance.onsocial.testnet')).toBe(true);
    expect(isProtocolFacePairDao('treasury.onsocial.testnet')).toBe(true);
    expect(isProtocolFacePairDao('demo.sputnik-dao.near')).toBe(false);
    expect(isProtocolGovernanceFace('governance.onsocial.testnet')).toBe(true);
    expect(isProtocolGovernanceFace('treasury.onsocial.testnet')).toBe(false);
  });
});

describe('resolvePortfolioDaoEntity', () => {
  it('classifies sputnik / protocol accounts as DAO faces', async () => {
    await expect(
      resolvePortfolioDaoEntity('demo.sputnik-dao.near')
    ).resolves.toMatchObject({
      isDao: true,
      kindLabel: 'Community DAO',
      workspaceHref: '/@demo.sputnik-dao.near',
    });
    await expect(
      resolvePortfolioDaoEntity('guild.sputnikv2.testnet')
    ).resolves.toMatchObject({
      isDao: true,
      kindLabel: 'Community DAO',
      workspaceHref: '/@guild.sputnikv2.testnet',
    });
    await expect(
      resolvePortfolioDaoEntity('governance.onsocial.testnet')
    ).resolves.toMatchObject({
      isDao: true,
      kindLabel: 'Governance DAO',
    });
  });

  it('keeps people as non-DAO when catalog misses', async () => {
    vi.mocked(fetchDaoPortfolioPageBundle).mockResolvedValueOnce({
      dao: null,
      profile: null,
    });
    await expect(resolvePortfolioDaoEntity('alice.near')).resolves.toEqual({
      isDao: false,
      kindLabel: null,
      workspaceHref: null,
    });
  });

  it('treats catalog hits as DAO faces', async () => {
    vi.mocked(fetchDaoPortfolioPageBundle).mockResolvedValueOnce({
      dao: {
        daoAccountId: 'custom.near',
        name: 'Custom Org',
        purpose: 'Org purpose line',
        metadata: null,
        source: 'factory',
        listedAt: '2026-01-01T00:00:00.000Z',
      },
      profile: null,
    });
    await expect(resolvePortfolioDaoEntity('custom.near')).resolves.toMatchObject(
      {
        isDao: true,
        kindLabel: 'Community DAO',
        workspaceHref: '/@custom.near',
      }
    );
  });
});
