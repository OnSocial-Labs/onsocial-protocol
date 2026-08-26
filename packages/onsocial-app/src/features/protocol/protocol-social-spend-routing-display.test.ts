import { describe, expect, it } from 'vitest';
import { PROTOCOL_CONTRACT_CONFIG_OPS } from '@/features/protocol/protocol-contracts';
import {
  formatSocialSpendActionConfigCardSummary,
  formatSocialSpendActionRoutingSummary,
  shouldShowSocialSpendMinOnProposalCard,
} from '@/features/protocol/protocol-social-spend-routing-display';

const BOOST_POST_DEFAULT_MIN_YOCTO =
  PROTOCOL_CONTRACT_CONFIG_OPS.find((op) => op.actionId === 'boost_post')!
    .defaults.minAmountYocto;
const BOOST_POST_CHANGED_MIN_YOCTO = String(50n * 10n ** 18n);

describe('protocol social-spend routing display', () => {
  it('shows boost pool routing without zero buckets for #53-style config', () => {
    const config = {
      label: 'Boost Post',
      active: true,
      min_amount: BOOST_POST_DEFAULT_MIN_YOCTO,
      target_types: ['post'],
      treasury_bps: 2500,
      season_pool_bps: 0,
      target_bps: 7000,
      burn_bps: 500,
    };

    expect(formatSocialSpendActionRoutingSummary(config)).toBe(
      '25% boost pool · 70% target · 5% burn'
    );
    expect(
      formatSocialSpendActionConfigCardSummary(config, 'boost_post')
    ).toBe('25% boost pool · 70% target · 5% burn');
    expect(shouldShowSocialSpendMinOnProposalCard(config, 'boost_post')).toBe(
      false
    );
  });

  it('shows min only when it differs from the action default', () => {
    const config = {
      treasury_bps: 1000,
      season_pool_bps: 0,
      target_bps: 9000,
      burn_bps: 0,
      min_amount: BOOST_POST_CHANGED_MIN_YOCTO,
    };

    expect(shouldShowSocialSpendMinOnProposalCard(config, 'boost_post')).toBe(
      true
    );
    expect(
      formatSocialSpendActionConfigCardSummary(config, 'boost_post')
    ).toBe('min 50 SOCIAL · 10% boost pool · 90% target');
  });

  it('uses fees label when protocol fees do not route to boost', () => {
    const config = {
      treasury_bps: 500,
      season_pool_bps: 0,
      target_bps: 9500,
      burn_bps: 0,
    };

    expect(
      formatSocialSpendActionRoutingSummary(config, {
        protocolFeesRouteToBoost: false,
      })
    ).toBe('5% fees · 95% target');
  });
});
