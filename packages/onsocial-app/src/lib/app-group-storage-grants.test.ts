import { describe, expect, it } from 'vitest';
import {
  pickActiveGroupSponsorDefault,
  pickActiveGroupSponsorGrants,
} from '@/lib/app-group-storage-grants';

describe('pickActiveGroupSponsorGrants', () => {
  it('keeps the newest enabled override per member', () => {
    const grants = pickActiveGroupSponsorGrants([
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
    ]);

    expect(grants).toEqual([
      { accountId: 'bob.near', maxBytes: 4096, usedBytes: 0 },
    ]);
  });

  it('includes optimistic pending targets', () => {
    const grants = pickActiveGroupSponsorGrants([], ['carol.near']);
    expect(grants).toEqual([
      { accountId: 'carol.near', maxBytes: 0, usedBytes: 0 },
    ]);
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
