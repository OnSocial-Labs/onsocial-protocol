import { describe, expect, it } from 'vitest';

import { buildPreSeasonSocialEdgeExclusion } from '../../src/services/seasons/season-standings.js';
import { resolveSeasonSocialBaselineNs } from '../../src/services/seasons/season-onchain-config.js';

describe('season-zero social anti-gaming', () => {
  it('resolves season social baseline from on-chain config', () => {
    expect(
      resolveSeasonSocialBaselineNs({
        label: 'Season Zero',
        active: true,
        starts_at_ns: '1700000000000000000',
        ends_at_ns: '1800000000000000000',
        is_live: true,
        claim_open: false,
      })
    ).toBe('1700000000000000000');

    expect(resolveSeasonSocialBaselineNs(null)).toBeNull();
    expect(
      resolveSeasonSocialBaselineNs({
        label: 'Season Zero',
        active: true,
        starts_at_ns: '0',
        ends_at_ns: '1800000000000000000',
        is_live: true,
        claim_open: false,
      })
    ).toBeNull();
  });

  it('builds pre-season exclusion SQL for stands and endorsements', () => {
    const standing = buildPreSeasonSocialEdgeExclusion(
      'incoming.account_id',
      'incoming.target_account',
      'standing',
      '1700000000000000000',
      3
    );

    expect(standing).toContain("prior.data_type = 'standing'");
    expect(standing).toContain('prior.account_id = incoming.account_id');
    expect(standing).toContain(
      'prior.target_account = incoming.target_account'
    );
    expect(standing).toContain('prior.block_timestamp < $3::numeric');

    const endorsement = buildPreSeasonSocialEdgeExclusion(
      'e.issuer',
      'e.target',
      'endorsement',
      '1700000000000000000',
      4
    );

    expect(endorsement).toContain("prior.data_type = 'endorsement'");
    expect(endorsement).toContain('prior.block_timestamp < $4::numeric');
  });

  it('returns empty SQL when season start is unavailable', () => {
    expect(
      buildPreSeasonSocialEdgeExclusion('a', 'b', 'standing', null, 3)
    ).toBe('');
  });
});
