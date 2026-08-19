import { describe, expect, it } from 'vitest';

function rankDaoCatalogMatch(
  query: string,
  row: { daoAccountId: string; name: string | null }
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 3;
  const account = row.daoAccountId.trim().toLowerCase();
  const name = row.name?.trim().toLowerCase() ?? '';
  if (account === q) return 0;
  if (account.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  return 3;
}

/** Mirrors empty-browse SQL tiers (seed → onsocial host → profile flag). */
function emptyBrowseTier(row: {
  daoAccountId: string;
  source: string;
  hasOnSocialProfile: boolean;
}): [number, number, number] {
  const id = row.daoAccountId.trim().toLowerCase();
  const sourceTier = row.source === 'seed' ? 0 : 1;
  const onsocialTier =
    id.endsWith('.onsocial.near') ||
    id.endsWith('.onsocial.testnet') ||
    id === 'onsocial.near' ||
    id === 'onsocial.testnet'
      ? 0
      : 1;
  const profileTier = row.hasOnSocialProfile ? 0 : 1;
  return [sourceTier, onsocialTier, profileTier];
}

describe('dao catalog search ranking', () => {
  it('prefers exact account, then prefixes', () => {
    expect(
      rankDaoCatalogMatch('demo.sputnikv2.testnet', {
        daoAccountId: 'demo.sputnikv2.testnet',
        name: 'Demo',
      })
    ).toBe(0);
    expect(
      rankDaoCatalogMatch('demo', {
        daoAccountId: 'demo.sputnikv2.testnet',
        name: 'Other',
      })
    ).toBe(1);
    expect(
      rankDaoCatalogMatch('onso', {
        daoAccountId: 'x.sputnikv2.testnet',
        name: 'OnSocial Guild',
      })
    ).toBe(2);
  });
});

describe('dao catalog empty browse tiers', () => {
  it('ranks seed and OnSocial hosts ahead of profiled factory DAOs', () => {
    const rows = [
      {
        daoAccountId: 'zzz.sputnikv2.testnet',
        source: 'factory',
        hasOnSocialProfile: false,
      },
      {
        daoAccountId: 'cool.sputnikv2.testnet',
        source: 'factory',
        hasOnSocialProfile: true,
      },
      {
        daoAccountId: 'alpha.onsocial.testnet',
        source: 'factory',
        hasOnSocialProfile: false,
      },
      {
        daoAccountId: 'treasury.onsocial.testnet',
        source: 'seed',
        hasOnSocialProfile: true,
      },
    ];
    const ranked = [...rows].sort((a, b) => {
      const ta = emptyBrowseTier(a);
      const tb = emptyBrowseTier(b);
      for (let i = 0; i < 3; i += 1) {
        if (ta[i] !== tb[i]) return ta[i]! - tb[i]!;
      }
      return a.daoAccountId.localeCompare(b.daoAccountId);
    });
    expect(ranked.map((row) => row.daoAccountId)).toEqual([
      'treasury.onsocial.testnet',
      'alpha.onsocial.testnet',
      'cool.sputnikv2.testnet',
      'zzz.sputnikv2.testnet',
    ]);
  });
});

describe('getDaoCatalogRowsByIds id normalization', () => {
  it('dedupes and rejects invalid account ids', () => {
    const raw = [
      ' Demo.Sputnik-Dao.Near ',
      'demo.sputnik-dao.near',
      '',
      'BAD ID',
      'ok.near',
    ];
    const ids = Array.from(
      new Set(
        raw
          .map((id) => id.trim().toLowerCase())
          .filter((id) => /^[a-z0-9][a-z0-9._-]{1,63}$/.test(id))
      )
    ).slice(0, 64);
    expect(ids).toEqual(['demo.sputnik-dao.near', 'ok.near']);
  });
});
