import { describe, expect, it } from 'vitest';
import {
  latestRemainingByPayer,
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

  it('derives used bytes from latest spend remaining allowance', () => {
    const grants = pickActiveGroupSponsorGrants(
      [
        {
          memberId: 'bob.near',
          quotaBytes: '4096',
          dailyLimit: '0',
          previouslyEnabled: false,
          extraData: JSON.stringify({ enabled: 'true' }),
          blockHeight: 10,
        },
      ],
      [],
      [
        {
          payer: 'bob.near',
          bytes: '100',
          remainingAllowance: '3000',
          blockHeight: 20,
        },
        {
          payer: 'bob.near',
          bytes: '50',
          remainingAllowance: '3900',
          blockHeight: 15,
        },
      ]
    );

    expect(grants).toEqual([
      { accountId: 'bob.near', maxBytes: 4096, usedBytes: 1096 },
    ]);
  });

  it('includes optimistic pending targets', () => {
    const grants = pickActiveGroupSponsorGrants([], ['carol.near']);
    expect(grants).toEqual([
      { accountId: 'carol.near', maxBytes: 0, usedBytes: 0 },
    ]);
  });
});

describe('latestRemainingByPayer', () => {
  it('keeps only the newest remaining per payer', () => {
    expect(
      Object.fromEntries(
        latestRemainingByPayer([
          {
            payer: 'a.near',
            bytes: '1',
            remainingAllowance: '10',
            blockHeight: 3,
          },
          {
            payer: 'a.near',
            bytes: '1',
            remainingAllowance: '99',
            blockHeight: 1,
          },
          {
            payer: 'b.near',
            bytes: '1',
            remainingAllowance: '0',
            blockHeight: 2,
          },
        ])
      )
    ).toEqual({ 'a.near': 10, 'b.near': 0 });
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
