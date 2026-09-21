import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewerCanProposeOnDao } from '@/features/protocol/protocol-eligibility';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'protocol-eligibility.ts'),
  'utf8'
);

describe('getProtocolDaoStakeProposePath', () => {
  it('throws on RPC miss so Manage can fail-open Stake', () => {
    expect(src).toContain(
      "viewNearContract<ProtocolDaoPolicy>(daoAccountId, 'get_policy')"
    );
    expect(src).toContain(
      "viewNearContract<string>(daoAccountId, 'get_staking_contract')"
    );
  });
});

describe('viewerCanProposeOnDao', () => {
  it('is false without eligibility', () => {
    expect(viewerCanProposeOnDao(null)).toBe(false);
    expect(viewerCanProposeOnDao(undefined)).toBe(false);
  });

  it('uses policy canAddProposal when present', () => {
    expect(
      viewerCanProposeOnDao({
        canPropose: false,
        isGroupMember: true,
        canAddProposal: false,
      })
    ).toBe(false);
    expect(
      viewerCanProposeOnDao({
        canPropose: false,
        isGroupMember: false,
        canAddProposal: true,
      })
    ).toBe(true);
  });

  it('falls back to group or weight when canAddProposal is omitted', () => {
    expect(
      viewerCanProposeOnDao({ canPropose: false, isGroupMember: true })
    ).toBe(true);
    expect(
      viewerCanProposeOnDao({ canPropose: true, isGroupMember: false })
    ).toBe(true);
    expect(
      viewerCanProposeOnDao({ canPropose: false, isGroupMember: false })
    ).toBe(false);
  });
});
