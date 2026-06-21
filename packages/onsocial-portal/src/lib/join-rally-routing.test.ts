import { describe, expect, it } from 'vitest';
import {
  formatJoinEntryGuideLabel,
  formatJoinRoutingDisclosure,
  parseJoinRallyMinAmount,
} from '@/lib/join-rally-routing';

describe('join-rally-routing', () => {
  it('returns null when min amount is missing', () => {
    expect(parseJoinRallyMinAmount(null)).toBeNull();
    expect(parseJoinRallyMinAmount({ min_amount: '0' })).toBeNull();
  });

  it('uses on-chain join rally min when configured', () => {
    expect(
      parseJoinRallyMinAmount({
        min_amount: '1000000000000000000000',
      })
    ).toEqual({
      yocto: 1_000_000_000_000_000_000_000n,
      socialLabel: '1000',
    });
  });

  it('formats guide labels with live min and routing', () => {
    const disclosure = {
      config: {
        treasury_bps: 500,
        season_pool_bps: 9500,
        target_bps: 0,
        burn_bps: 0,
        min_amount: '100000000000000000000',
      },
      protocolFeesRouteToBoost: true,
      joinMinAmountYocto: 100_000_000_000_000_000_000n,
      joinMinAmountSocialLabel: '100',
    };

    expect(formatJoinRoutingDisclosure(disclosure)).toBe(
      '95 to pool · 5 boost credits'
    );
    expect(formatJoinEntryGuideLabel(disclosure)).toBe(
      '100 SOCIAL · 95 to pool · 5 boost credits'
    );
    expect(formatJoinEntryGuideLabel(null)).toBe('Rally entry unavailable');
    expect(formatJoinEntryGuideLabel(null, { loading: true })).toBe(
      'Loading rally entry…'
    );
  });
});
