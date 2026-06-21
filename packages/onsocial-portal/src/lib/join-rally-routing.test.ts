import { describe, expect, it } from 'vitest';
import {
  estimateJoinTreasuryYocto,
  formatJoinEntryGuideLabel,
  formatJoinRoutingDisclosure,
  formatJoinSpendSplitPercentLabel,
  joinBpsToPercentLabel,
  parseJoinRallyMinAmount,
  resolveJoinSpendSplitParts,
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

  it('formats join spend split percent labels', () => {
    expect(joinBpsToPercentLabel(9500)).toBe('95');
    expect(formatJoinSpendSplitPercentLabel({ label: 'Pool', bps: 9500 })).toBe(
      '95% Pool'
    );
  });

  it('resolves per-entry spend split for the metrics strip', () => {
    const disclosure = {
      config: {
        treasury_bps: 400,
        season_pool_bps: 9500,
        target_bps: 0,
        burn_bps: 100,
        min_amount: '100000000000000000000',
      },
      protocolFeesRouteToBoost: true,
      joinMinAmountYocto: 100_000_000_000_000_000_000n,
      joinMinAmountSocialLabel: '100',
    };

    expect(resolveJoinSpendSplitParts(disclosure)).toEqual([
      { amount: '95', label: 'Pool', bps: 9500 },
      { amount: '4', label: 'Boost', bps: 400, accent: 'blue' },
      { amount: '1', label: 'Burn', bps: 100 },
    ]);
  });

  it('estimates treasury share from indexed join pool', () => {
    expect(
      estimateJoinTreasuryYocto('95000000000000000000', 9500, 500).toString()
    ).toBe('5000000000000000000');
  });
});
