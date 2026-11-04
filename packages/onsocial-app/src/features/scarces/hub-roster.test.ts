import { describe, expect, it } from 'vitest';
import type { AppView } from '@/features/scarces/apps-data';
import {
  applyOwnerHubCreatedFallback,
  buildHubRosterRows,
  hubRosterIsOwnerOnly,
  mergeHubRosterRows,
} from '@/features/scarces/hub-roster';

function app(overrides: Partial<AppView> = {}): AppView {
  return {
    appId: 'hub_1',
    ownerId: 'owner.testnet',
    title: 'Hub',
    mediaUrl: null,
    bannerUrl: null,
    categories: ['music'],
    category: 'music',
    primarySaleBps: 0,
    commissionPct: '0',
    creatorAccess: 'approval',
    moderators: [],
    approvedCreators: [],
    metadataRaw: null,
    ...overrides,
  };
}

describe('hub roster', () => {
  it('falls back owner since from hub created timestamp', () => {
    const rows = applyOwnerHubCreatedFallback(
      buildHubRosterRows(app()),
      1_776_000_003_000_000_000
    );
    expect(rows[0]?.addedAtNs).toBe(1_776_000_003_000_000_000);
  });

  it('prefers graph owner row over hub created fallback', () => {
    const merged = mergeHubRosterRows(app(), {
      addedTimes: new Map([['owner:owner.testnet', 1_800_000_000_000_000_000]]),
      hubCreatedTimestamp: 1_776_000_003_000_000_000,
    });
    expect(merged[0]?.addedAtNs).toBe(1_800_000_000_000_000_000);
  });

  it('detects owner-only roster', () => {
    expect(hubRosterIsOwnerOnly(buildHubRosterRows(app()))).toBe(true);
    expect(
      hubRosterIsOwnerOnly(
        buildHubRosterRows(app({ moderators: ['mod.testnet'] }))
      )
    ).toBe(false);
  });
});
