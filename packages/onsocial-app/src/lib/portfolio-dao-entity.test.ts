import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/app-config', () => ({
  GOVERNANCE_DAO_ACCOUNT: 'governance.onsocial.testnet',
  TREASURY_DAO_ACCOUNT: 'treasury.onsocial.testnet',
}));

vi.mock('@/lib/dao-catalog-lookup', () => ({
  lookupDaoCatalogByIds: vi.fn(async () => new Map()),
}));

import { lookupDaoCatalogByIds } from '@/lib/dao-catalog-lookup';
import { resolvePortfolioDaoEntity } from './portfolio-dao-entity';

describe('resolvePortfolioDaoEntity', () => {
  it('classifies sputnik / protocol accounts as DAO faces', async () => {
    await expect(
      resolvePortfolioDaoEntity('demo.sputnik-dao.near')
    ).resolves.toMatchObject({
      isDao: true,
      kindLabel: 'DAO',
      workspaceHref: '/dao/demo.sputnik-dao.near',
    });
    await expect(
      resolvePortfolioDaoEntity('guild.sputnikv2.testnet')
    ).resolves.toMatchObject({
      isDao: true,
      workspaceHref: '/dao/guild.sputnikv2.testnet',
    });
    await expect(
      resolvePortfolioDaoEntity('governance.onsocial.testnet')
    ).resolves.toMatchObject({
      isDao: true,
      kindLabel: 'Governance DAO',
    });
  });

  it('keeps people as non-DAO when catalog misses', async () => {
    vi.mocked(lookupDaoCatalogByIds).mockResolvedValueOnce(new Map());
    await expect(resolvePortfolioDaoEntity('alice.near')).resolves.toEqual({
      isDao: false,
      kindLabel: null,
      workspaceHref: null,
    });
  });

  it('treats catalog hits as DAO faces', async () => {
    vi.mocked(lookupDaoCatalogByIds).mockResolvedValueOnce(
      new Map([
        [
          'custom.near',
          {
            daoAccountId: 'custom.near',
            name: 'Custom Org',
            purpose: null,
            metadata: null,
            source: 'factory',
            listedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ])
    );
    await expect(resolvePortfolioDaoEntity('custom.near')).resolves.toMatchObject(
      {
        isDao: true,
        workspaceHref: '/dao/custom.near',
      }
    );
  });
});
