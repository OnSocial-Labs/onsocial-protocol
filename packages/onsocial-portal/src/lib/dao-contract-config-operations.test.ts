import { describe, expect, it } from 'vitest';
import {
  canProposeSocialSpendActionRoutingDraft,
  DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
  formatSocialSpendActionRoutingSummary,
  getSocialSpendActionRoutingOperationConfig,
  parseSocialSpendActionConfigView,
  socialSpendActionRoutingChanged,
  validateSocialSpendActionRoutingBps,
} from '@/lib/dao-contract-config-operations';

describe('dao-contract-config-operations', () => {
  it('parses join rally action config from chain view', () => {
    const parsed = parseSocialSpendActionConfigView({
      label: 'Join Rally',
      active: true,
      min_amount: '100000000000000000000',
      target_types: ['rally'],
      treasury_bps: 500,
      season_pool_bps: 9500,
      target_bps: 0,
      burn_bps: 0,
      season_required: true,
      allow_self_target: true,
    });

    expect(parsed).toMatchObject({
      treasury_bps: 500,
      season_pool_bps: 9500,
      burn_bps: 0,
    });
  });

  it('validates routing bps sum to 10000', () => {
    expect(
      validateSocialSpendActionRoutingBps({
        treasury_bps: 0,
        season_pool_bps: 9500,
        target_bps: 0,
        burn_bps: 500,
      })
    ).toBe(true);

    expect(
      validateSocialSpendActionRoutingBps({
        treasury_bps: 500,
        season_pool_bps: 9000,
        target_bps: 0,
        burn_bps: 0,
      })
    ).toBe(false);
  });

  it('formats routing summary and detects changes', () => {
    const baseline = {
      label: 'Join Rally',
      active: true,
      min_amount: '100000000000000000000',
      target_types: ['rally'],
      treasury_bps: 500,
      season_pool_bps: 9500,
      target_bps: 0,
      burn_bps: 0,
      season_required: true,
      allow_self_target: true,
    };
    const next = { ...baseline, treasury_bps: 0, burn_bps: 500 };

    expect(formatSocialSpendActionRoutingSummary(next)).toBe(
      '95% pool · 5% burn'
    );
    expect(
      formatSocialSpendActionRoutingSummary(
        { ...baseline, treasury_bps: 500 },
        { protocolFeesRouteToBoost: true }
      )
    ).toBe('95% pool · 5% boost credits');
    expect(socialSpendActionRoutingChanged(baseline, next)).toBe(true);
    expect(socialSpendActionRoutingChanged(baseline, baseline)).toBe(false);
  });

  it('exposes support endorsement defaults and proposal readiness', () => {
    const config = getSocialSpendActionRoutingOperationConfig(
      'social_spend_support_endorsement_routing'
    );

    expect(config).toMatchObject({
      actionId: 'support_endorsement',
      actionLabel: 'support endorsement',
    });
    expect(config?.defaultDraft).toEqual(
      DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT
    );
    expect(
      canProposeSocialSpendActionRoutingDraft(
        null,
        DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT
      )
    ).toBe(true);
    expect(
      formatSocialSpendActionRoutingSummary(
        DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
        { protocolFeesRouteToBoost: true }
      )
    ).toBe('1% boost credits · 99% target');
  });
});
