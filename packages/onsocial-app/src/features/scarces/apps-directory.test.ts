import { describe, expect, it } from 'vitest';
import {
  filterDirectoryApps,
  isLikelyTestStore,
  matchesAppQuery,
  sortApps,
} from '@/features/scarces/apps-directory';
import type { AppView } from '@/features/scarces/apps-data';

function stubApp(partial: Partial<AppView> & Pick<AppView, 'appId'>): AppView {
  return {
    ownerId: 'owner.near',
    title: partial.appId,
    mediaUrl: null,
    bannerUrl: null,
    primarySaleBps: 250,
    commissionPct: '2.5',
    creatorAccess: 'open',
    moderators: [],
    approvedCreators: [],
    metadataRaw: null,
    ...partial,
  };
}

describe('isLikelyTestStore', () => {
  it('flags integration-test titles and CI app ids', () => {
    expect(
      isLikelyTestStore({
        appId: 'integration-test',
        title: 'integration-test',
      })
    ).toBe(true);
    expect(
      isLikelyTestStore({
        appId: 'intapptest_1777321405899_ie3kbb.test01.onsocial.testnet',
        title: 'IN',
      })
    ).toBe(true);
    expect(
      isLikelyTestStore({
        appId: 'smokeapptest_1778886882986_muq1xz.test01.onsocial.testnet',
        title: 'SM',
      })
    ).toBe(true);
    expect(
      isLikelyTestStore({
        appId: 'intapp1777321405899.owner.testnet',
        title: 'Temp',
      })
    ).toBe(true);
  });

  it('keeps real storefronts', () => {
    expect(
      isLikelyTestStore({
        appId: 'atelier.onsocial.testnet',
        title: 'Atelier',
      })
    ).toBe(false);
    expect(
      isLikelyTestStore({
        appId: 'tier3test.onsocial.testnet',
        title: 'tier3test.onsocial.testnet',
      })
    ).toBe(false);
  });
});

describe('filterDirectoryApps', () => {
  const apps = [
    stubApp({
      appId: 'atelier',
      title: 'Atelier',
      creatorAccess: 'open',
      primarySaleBps: 500,
      commissionPct: '5',
      updatedAtMs: 30,
    }),
    stubApp({
      appId: 'closed-shop',
      title: 'Closed Shop',
      creatorAccess: 'invite_only',
      primarySaleBps: 0,
      commissionPct: '0',
      updatedAtMs: 20,
    }),
    stubApp({
      appId: 'intapptest_1.owner.testnet',
      title: 'integration-test',
      creatorAccess: 'open',
      updatedAtMs: 99,
    }),
  ];

  it('hides tests by default and filters access + query', () => {
    const openOnly = filterDirectoryApps(apps, {
      access: 'open',
      query: 'atel',
    });
    expect(openOnly.map((row) => row.appId)).toEqual(['atelier']);
  });

  it('can show tests when asked', () => {
    const all = filterDirectoryApps(apps, { hideTest: false, sort: 'recent' });
    expect(all[0]?.appId).toBe('intapptest_1.owner.testnet');
  });

  it('sorts by fee and name', () => {
    const byFee = sortApps(
      apps.filter((row) => !isLikelyTestStore(row)),
      'fee-asc'
    );
    expect(byFee.map((row) => row.appId)).toEqual(['closed-shop', 'atelier']);
    expect(matchesAppQuery(apps[0]!, 'atelier')).toBe(true);
    expect(matchesAppQuery(apps[0]!, 'zzz')).toBe(false);
  });
});
