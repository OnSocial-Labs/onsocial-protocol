import { describe, expect, it } from 'vitest';

import {
  resolveArchiveSeasonBadge,
  resolveArchiveSeasonClaimHint,
} from '@/features/season/season-archive-claim-hints';
import type { SeasonRegistryEntry } from '@/lib/season-registry';

function archiveEntry(
  overrides: Partial<SeasonRegistryEntry> = {}
): SeasonRegistryEntry {
  return {
    seasonId: 'season-two',
    label: 'Season Two',
    active: false,
    phase: 'claim',
    starts_at_ns: '0',
    ends_at_ns: '0',
    claim_starts_at_ns: '0',
    is_live: false,
    claim_open: true,
    rallyPath: '/season/season-two',
    ...overrides,
  };
}

describe('season-archive-claim-hints', () => {
  it('maps claim records to collect, collected, and none', () => {
    expect(
      resolveArchiveSeasonClaimHint({
        seasonId: 'season-two',
        accountId: 'alice.testnet',
        root: 'root',
        amountYocto: '100',
        proof: [],
        rank: 1,
        score: 10,
        claimed: false,
      })
    ).toBe('collect');

    expect(
      resolveArchiveSeasonClaimHint({
        seasonId: 'season-two',
        accountId: 'alice.testnet',
        root: 'root',
        amountYocto: '100',
        proof: [],
        rank: 1,
        score: 10,
        claimed: true,
      })
    ).toBe('collected');

    expect(resolveArchiveSeasonClaimHint(null)).toBe('none');
  });

  it('shows Collect only when wallet has an unclaimed reward', () => {
    expect(
      resolveArchiveSeasonBadge({
        entry: archiveEntry(),
        hint: 'collect',
        hintsReady: true,
        walletConnected: true,
      })
    ).toEqual({ label: 'Collect', tone: 'gold' });
  });

  it('shows neutral copy while loading or disconnected', () => {
    expect(
      resolveArchiveSeasonBadge({
        entry: archiveEntry(),
        hintsReady: false,
        walletConnected: true,
      })
    ).toEqual({ label: '', tone: 'loading' });

    expect(
      resolveArchiveSeasonBadge({
        entry: archiveEntry(),
        hintsReady: true,
        walletConnected: false,
      })
    ).toEqual({ label: 'Claims open', tone: 'muted' });
  });

  it('falls back to Archive when claim window is open but wallet has no payout', () => {
    expect(
      resolveArchiveSeasonBadge({
        entry: archiveEntry(),
        hint: 'none',
        hintsReady: true,
        walletConnected: true,
      })
    ).toEqual({ label: 'Archive', tone: 'muted' });
  });

  it('uses phase label for non-claim seasons', () => {
    expect(
      resolveArchiveSeasonBadge({
        entry: archiveEntry({
          claim_open: false,
          phase: 'archived',
        }),
        hintsReady: true,
        walletConnected: true,
      })
    ).toEqual({ label: 'Archive', tone: 'muted' });
  });
});
