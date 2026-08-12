import { describe, expect, it } from 'vitest';
import {
  discoverGroupSponsorTargetIds,
  liveQuotaToGrant,
  pickActiveGroupSponsorDefault,
  pickActiveGroupSponsorDefaultFromLive,
} from '@/lib/app-group-storage-grants';

describe('discoverGroupSponsorTargetIds', () => {
  it('keeps newest enabled targets and drops disables', () => {
    expect(
      discoverGroupSponsorTargetIds([
        {
          memberId: 'alice.near',
          quotaBytes: '0',
          dailyLimit: '0',
          previouslyEnabled: true,
          extraData: JSON.stringify({ enabled: 'false' }),
          blockHeight: 20,
        },
        {
          memberId: 'bob.near',
          quotaBytes: '4096',
          dailyLimit: '0',
          previouslyEnabled: false,
          extraData: JSON.stringify({ enabled: 'true' }),
          blockHeight: 19,
        },
        {
          memberId: 'alice.near',
          quotaBytes: '2048',
          dailyLimit: '0',
          previouslyEnabled: false,
          extraData: JSON.stringify({ enabled: 'true' }),
          blockHeight: 10,
        },
      ])
    ).toEqual(['bob.near']);
  });

  it('includes optimistic pending targets', () => {
    expect(discoverGroupSponsorTargetIds([], ['carol.near'])).toEqual([
      'carol.near',
    ]);
  });
});

describe('liveQuotaToGrant', () => {
  it('maps live override quota to used/max grant', () => {
    expect(
      liveQuotaToGrant('bob.near', {
        enabled: true,
        is_override: true,
        allowance_max_bytes: 4096,
        allowance_bytes: 3000,
        used_bytes: 1096,
      })
    ).toEqual({
      accountId: 'bob.near',
      maxBytes: 4096,
      usedBytes: 1096,
    });
  });

  it('skips disabled and non-override rows', () => {
    expect(
      liveQuotaToGrant('bob.near', {
        enabled: false,
        is_override: true,
        allowance_max_bytes: 4096,
        used_bytes: 0,
      })
    ).toBeNull();
    expect(
      liveQuotaToGrant('bob.near', {
        enabled: true,
        is_override: false,
        allowance_max_bytes: 4096,
        used_bytes: 0,
      })
    ).toBeNull();
  });
});

describe('pickActiveGroupSponsorDefaultFromLive', () => {
  it('reads live default policy', () => {
    expect(
      pickActiveGroupSponsorDefaultFromLive({
        enabled: true,
        allowance_max_bytes: 8192,
        daily_refill_bytes: 0,
      })
    ).toEqual({
      enabled: true,
      maxBytes: 8192,
      dailyRefillBytes: 0,
    });
  });
});

describe('pickActiveGroupSponsorDefault', () => {
  it('reads the newest default policy event', () => {
    expect(
      pickActiveGroupSponsorDefault([
        {
          quotaBytes: '8192',
          dailyLimit: '0',
          previouslyEnabled: false,
          extraData: JSON.stringify({ enabled: true }),
          blockHeight: 5,
        },
      ])
    ).toEqual({
      enabled: true,
      maxBytes: 8192,
      dailyRefillBytes: 0,
    });
  });

  it('returns disabled when latest event turns default off', () => {
    expect(
      pickActiveGroupSponsorDefault([
        {
          quotaBytes: '0',
          dailyLimit: '0',
          previouslyEnabled: true,
          extraData: JSON.stringify({ enabled: 'false' }),
          blockHeight: 6,
        },
      ])
    ).toEqual({ enabled: false, maxBytes: 0, dailyRefillBytes: 0 });
  });
});
