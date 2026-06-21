import { describe, expect, it } from 'vitest';

import {
  resolveRallyHeroJoinEntryLabel,
  shouldUseHistoricalRallyJoinEntry,
} from '@/lib/rally-join-entry';

describe('shouldUseHistoricalRallyJoinEntry', () => {
  it('uses live chain config for upcoming and live rallies', () => {
    expect(shouldUseHistoricalRallyJoinEntry('upcoming')).toBe(false);
    expect(shouldUseHistoricalRallyJoinEntry('live')).toBe(false);
  });

  it('uses indexed entry for finished rallies', () => {
    expect(shouldUseHistoricalRallyJoinEntry('ended_pending_settlement')).toBe(
      true
    );
    expect(shouldUseHistoricalRallyJoinEntry('claim_open')).toBe(true);
  });
});

describe('resolveRallyHeroJoinEntryLabel', () => {
  const formatYocto = (yocto: string) => `fmt:${yocto}`;

  it('prefers indexed entry for ended seasons', () => {
    expect(
      resolveRallyHeroJoinEntryLabel({
        phase: 'claim_open',
        seasonJoinEntryYocto: '1000000000000000000000',
        currentJoinEntryLabel: '250',
        formatYocto,
      })
    ).toBe('fmt:1000000000000000000000');
  });

  it('uses current chain entry for live seasons', () => {
    expect(
      resolveRallyHeroJoinEntryLabel({
        phase: 'live',
        seasonJoinEntryYocto: '1000000000000000000000',
        currentJoinEntryLabel: '250',
        formatYocto,
      })
    ).toBe('250');
  });

  it('hides entry when a finished season has no indexed joins', () => {
    expect(
      resolveRallyHeroJoinEntryLabel({
        phase: 'claim_open',
        seasonJoinEntryYocto: null,
        currentJoinEntryLabel: '250',
        formatYocto,
      })
    ).toBeNull();
  });
});
