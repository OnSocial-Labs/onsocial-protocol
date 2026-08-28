import { describe, expect, it } from 'vitest';
import {
  deriveSeasonClaimRecord,
  reconcileSeasonClaimed,
  reconcileSeasonJoined,
  recordSeasonClaimed,
  recordSeasonJoined,
  resolveSeasonJoined,
} from '@/lib/season-participation-ledger';

describe('season-participation-ledger', () => {
  it('treats a confirmed join as joined until the API agrees', () => {
    const ledger = new Map<string, true>();
    expect(resolveSeasonJoined(ledger, 'season-one', false)).toBe(false);
    recordSeasonJoined(ledger, 'season-one');
    expect(resolveSeasonJoined(ledger, 'season-one', false)).toBe(true);
    expect(reconcileSeasonJoined(ledger, 'season-one', true)).toBe(true);
    expect(resolveSeasonJoined(ledger, 'season-one', true)).toBe(true);
  });

  it('marks an unclaimed reward claimed after collect', () => {
    const ledger = new Map<string, true>();
    const claim = {
      seasonId: 'season-one',
      claimed: false as boolean | null,
    };
    recordSeasonClaimed(ledger, 'season-one');
    expect(deriveSeasonClaimRecord(claim, ledger)?.claimed).toBe(true);
    expect(reconcileSeasonClaimed(ledger, 'season-one', true)).toBe(true);
  });
});
