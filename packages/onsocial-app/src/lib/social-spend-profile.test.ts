import { describe, expect, it } from 'vitest';
import {
  amplifyRoutingPhrases,
  formatSupportProfileRecipientSharePercent,
  formatSupportProfileTreasurySharePercent,
  formatSupportSplitSocialLabel,
  parseSupportProfileActionConfig,
  splitAmplifyAmountYocto,
  splitSupportAmountYocto,
  SUPPORT_PROFILE_TARGET_BPS,
  SUPPORT_PROFILE_TREASURY_BPS,
} from './social-spend-profile';

describe('parseSupportProfileActionConfig', () => {
  it('reads live min + routing bps from get_action_config', () => {
    const parsed = parseSupportProfileActionConfig({
      label: 'Support profile',
      active: true,
      min_amount: '10000000000000000',
      target_types: ['profile'],
      treasury_bps: 250,
      season_pool_bps: 0,
      target_bps: 9750,
      burn_bps: 0,
      season_required: false,
      allow_self_target: false,
    });

    expect(parsed).toEqual({
      minAmountYocto: 10_000_000_000_000_000n,
      treasuryBps: 250,
      targetBps: 9750,
      burnBps: 0,
      seasonPoolBps: 0,
      active: true,
    });
  });

  it('returns null for incomplete config', () => {
    expect(parseSupportProfileActionConfig(null)).toBeNull();
    expect(parseSupportProfileActionConfig({ label: 'x' })).toBeNull();
  });
});

describe('formatSupportProfile share percents', () => {
  it('defaults to fallback constants', () => {
    expect(formatSupportProfileRecipientSharePercent()).toBe(
      `${SUPPORT_PROFILE_TARGET_BPS / 100}`
    );
    expect(formatSupportProfileTreasurySharePercent()).toBe(
      `${SUPPORT_PROFILE_TREASURY_BPS / 100}`
    );
  });

  it('formats live bps', () => {
    expect(formatSupportProfileRecipientSharePercent(9750)).toBe('97.5');
    expect(formatSupportProfileTreasurySharePercent(250)).toBe('2.5');
  });
});

describe('splitSupportAmountYocto', () => {
  const oneSocial = 10n ** 18n;

  it('splits 1 SOCIAL at 99/1 without dust loss', () => {
    const { recipientYocto, treasuryYocto } = splitSupportAmountYocto(
      oneSocial,
      9_900,
      100
    );
    expect(recipientYocto + treasuryYocto).toBe(oneSocial);
    expect(recipientYocto).toBe((oneSocial * 9_900n) / 10_000n);
    expect(formatSupportSplitSocialLabel(recipientYocto)).toBe('0.99');
    expect(formatSupportSplitSocialLabel(treasuryYocto)).toBe('0.01');
  });

  it('returns zeros for non-positive amounts', () => {
    expect(splitSupportAmountYocto(0n, 9_900, 100)).toEqual({
      recipientYocto: 0n,
      treasuryYocto: 0n,
    });
  });
});

describe('amplify routing from get_action_config', () => {
  const oneSocial = 10n ** 18n;

  it('names author, protocol, and burn from the live bps', () => {
    const parsed = parseSupportProfileActionConfig({
      active: true,
      min_amount: '10000000000000000',
      treasury_bps: 2_500,
      season_pool_bps: 0,
      target_bps: 7_000,
      burn_bps: 500,
    });
    expect(parsed?.burnBps).toBe(500);
    const split = splitAmplifyAmountYocto(oneSocial, parsed!);
    expect(split.recipientYocto + split.treasuryYocto + split.burnYocto).toBe(
      oneSocial
    );
    expect(
      amplifyRoutingPhrases(parsed!, 'author', oneSocial)
    ).toEqual(['0.70 to author', '0.25 protocol', '0.05 burned']);
  });

  it('drops a zero burn and a zero season', () => {
    const routing = {
      targetBps: 9_900,
      treasuryBps: 100,
      burnBps: 0,
      seasonPoolBps: 0,
    };
    expect(amplifyRoutingPhrases(routing, 'author', oneSocial)).toEqual([
      '0.99 to author',
      '0.01 protocol',
    ]);
    expect(amplifyRoutingPhrases(routing, 'author', null)).toEqual([
      '99% to author',
      '1% protocol',
    ]);
  });
});
