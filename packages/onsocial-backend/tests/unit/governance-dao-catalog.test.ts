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
