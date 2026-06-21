import { describe, expect, it } from 'vitest';
import {
  canProposeSocialSpendActionRoutingDraft,
  DEFAULT_BOOST_POST_ROUTING_DRAFT,
  DEFAULT_JOIN_RALLY_ROUTING_DRAFT,
  DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
  DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT,
  formatSocialSpendActionConfigCardSummaryFromRecord,
  formatSocialSpendActionRoutingSummary,
  formatSocialSpendMinAmountCardLabel,
  formatSocialSpendRoutingFixedFieldsCaption,
  getSocialSpendRoutingFieldLayout,
  readSocialSpendActionMinAmountYocto,
  getSocialSpendActionRoutingOperationConfig,
  parseSocialSpendActionConfigView,
  sanitizeSocialSpendJoinRallyMinAmountInput,
  sanitizeSocialSpendSupportMinAmountInput,
  SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
  socialSpendActionDraftChanged,
  socialSpendActionRoutingBpsChanged,
  socialSpendActionRoutingProposalBlocker,
  validateSocialSpendJoinRallyMinAmountYocto,
  validateSocialSpendSupportMinAmountYocto,
  validateSocialSpendActionRoutingBps,
  SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO,
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
      formatSocialSpendActionConfigCardSummaryFromRecord(next)
    ).toBe('min 100 SOCIAL · 95% pool · 5% burn');
    expect(
      formatSocialSpendActionRoutingSummary(
        { ...baseline, treasury_bps: 500 },
        { protocolFeesRouteToBoost: true }
      )
    ).toBe('95% pool · 5% boost credits');
    expect(socialSpendActionRoutingBpsChanged(baseline, next)).toBe(true);
    expect(socialSpendActionRoutingBpsChanged(baseline, baseline)).toBe(false);
  });

  it('reads yocto min amounts from string config only', () => {
    expect(
      readSocialSpendActionMinAmountYocto({
        min_amount: SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
      })
    ).toBe(SOCIAL_SPEND_MIN_AMOUNT_YOCTO);
    expect(
      readSocialSpendActionMinAmountYocto({
        min_amount: 10000000000000000000,
      })
    ).toBeUndefined();
    expect(
      formatSocialSpendMinAmountCardLabel(SOCIAL_SPEND_MIN_AMOUNT_YOCTO)
    ).toBe('min 0.01 SOCIAL');
  });

  it('allows support profile proposals when only minimum spend changes', () => {
    const baseline = {
      ...DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT,
      min_amount: '10000000000000000000',
    };
    const next = {
      ...baseline,
      min_amount: DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT.min_amount,
    };

    expect(
      socialSpendActionDraftChanged(baseline, next, { includeMinAmount: true })
    ).toBe(true);
    expect(
      canProposeSocialSpendActionRoutingDraft(
        baseline,
        next,
        'social_spend_support_profile_routing'
      )
    ).toBe(true);
    expect(
      socialSpendActionRoutingProposalBlocker(
        baseline,
        next,
        'social_spend_support_profile_routing'
      )
    ).toBeNull();
  });

  it('sanitizes support minimum spend input like other governance amount fields', () => {
    expect(
      validateSocialSpendSupportMinAmountYocto(SOCIAL_SPEND_MIN_AMOUNT_YOCTO)
    ).toBe(true);
    expect(validateSocialSpendSupportMinAmountYocto('1000000000000000000')).toBe(
      true
    );
    expect(validateSocialSpendSupportMinAmountYocto('1')).toBe(false);
    expect(
      validateSocialSpendSupportMinAmountYocto('100000000000000000000001')
    ).toBe(false);

    expect(sanitizeSocialSpendSupportMinAmountInput('0.0')).toBe('0.0');
    expect(sanitizeSocialSpendSupportMinAmountInput('0.001', '0.00')).toBe(
      '0.00'
    );
    expect(sanitizeSocialSpendSupportMinAmountInput('0.01')).toBe('0.01');
    expect(sanitizeSocialSpendSupportMinAmountInput('101')).toBe('100');
    expect(sanitizeSocialSpendSupportMinAmountInput('100000')).toBe('100');
  });

  it('allows join rally proposals when only minimum spend changes', () => {
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
    const next = {
      ...baseline,
      min_amount: '1000000000000000000000',
    };

    expect(
      canProposeSocialSpendActionRoutingDraft(
        baseline,
        next,
        'social_spend_join_rally_routing'
      )
    ).toBe(true);
    expect(
      socialSpendActionRoutingProposalBlocker(
        baseline,
        next,
        'social_spend_join_rally_routing'
      )
    ).toBeNull();
  });

  it('validates join rally minimum spend bounds', () => {
    expect(validateSocialSpendJoinRallyMinAmountYocto('1000000000000000000')).toBe(
      true
    );
    expect(
      validateSocialSpendJoinRallyMinAmountYocto('100000000000000000000')
    ).toBe(true);
    expect(
      validateSocialSpendJoinRallyMinAmountYocto(
        SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO
      )
    ).toBe(true);
    expect(
      validateSocialSpendJoinRallyMinAmountYocto('100000000000000000')
    ).toBe(false);
    expect(
      validateSocialSpendJoinRallyMinAmountYocto(
        `${SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO}1`
      )
    ).toBe(false);

    expect(sanitizeSocialSpendJoinRallyMinAmountInput('0.5', '100')).toBe(
      '100'
    );
    expect(sanitizeSocialSpendJoinRallyMinAmountInput('10001')).toBe('10000');
  });

  it('exposes join rally defaults and proposal readiness', () => {
    const config = getSocialSpendActionRoutingOperationConfig(
      'social_spend_join_rally_routing'
    );

    expect(config).toMatchObject({
      actionId: 'join_rally',
      actionLabel: 'join rally',
    });
    expect(config?.defaultDraft).toEqual(DEFAULT_JOIN_RALLY_ROUTING_DRAFT);
    expect(
      canProposeSocialSpendActionRoutingDraft(
        null,
        DEFAULT_JOIN_RALLY_ROUTING_DRAFT,
        'social_spend_join_rally_routing'
      )
    ).toBe(true);
  });

  it('exposes support profile defaults and proposal readiness', () => {
    const config = getSocialSpendActionRoutingOperationConfig(
      'social_spend_support_profile_routing'
    );

    expect(config).toMatchObject({
      actionId: 'support_profile',
      actionLabel: 'support profile',
    });
    expect(config?.defaultDraft).toEqual(DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT);
    expect(
      canProposeSocialSpendActionRoutingDraft(
        null,
        DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT,
        'social_spend_support_profile_routing'
      )
    ).toBe(true);
    expect(
      formatSocialSpendActionRoutingSummary(DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT, {
        protocolFeesRouteToBoost: true,
      })
    ).toBe('1% boost credits · 99% target');
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
        DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
        'social_spend_support_endorsement_routing'
      )
    ).toBe(true);
    expect(
      formatSocialSpendActionRoutingSummary(
        DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
        { protocolFeesRouteToBoost: true }
      )
    ).toBe('1% boost credits · 99% target');
  });

  it('exposes boost post defaults and proposal readiness', () => {
    const config = getSocialSpendActionRoutingOperationConfig(
      'social_spend_boost_post_routing'
    );

    expect(config).toMatchObject({
      actionId: 'boost_post',
      actionLabel: 'boost post',
    });
    expect(config?.defaultDraft).toEqual(DEFAULT_BOOST_POST_ROUTING_DRAFT);
    expect(
      canProposeSocialSpendActionRoutingDraft(
        null,
        DEFAULT_BOOST_POST_ROUTING_DRAFT,
        'social_spend_boost_post_routing'
      )
    ).toBe(true);
    expect(
      formatSocialSpendActionRoutingSummary(DEFAULT_BOOST_POST_ROUTING_DRAFT, {
        protocolFeesRouteToBoost: true,
      })
    ).toBe('10% boost credits · 90% target');
  });

  it('lays out primary routing fields per operation', () => {
    expect(
      getSocialSpendRoutingFieldLayout('social_spend_join_rally_routing')
        .primary
    ).toEqual([
      'season_pool_bps',
      'treasury_bps',
      'target_bps',
      'burn_bps',
    ]);

    expect(
      getSocialSpendRoutingFieldLayout(
        'social_spend_support_endorsement_routing'
      )
    ).toEqual({
      primary: ['treasury_bps', 'target_bps'],
      secondary: ['season_pool_bps', 'burn_bps'],
    });
  });

  it('formats fixed-field captions for routing operations', () => {
    expect(
      formatSocialSpendRoutingFixedFieldsCaption(
        'social_spend_support_endorsement_routing'
      )
    ).toBe('Endorsement target · label fixed');
  });
});
