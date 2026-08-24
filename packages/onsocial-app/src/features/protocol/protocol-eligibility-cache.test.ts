import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewNearContract = vi.fn();
const viewAccount = vi.fn();

vi.mock('@/lib/app-near-rpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/app-near-rpc')>();
  return {
    ...actual,
    viewNearContract: (...args: unknown[]) => viewNearContract(...args),
    viewAccount: (...args: unknown[]) => viewAccount(...args),
  };
});

import {
  getProtocolGovernanceEligibility,
  invalidateProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';

const EVERYONE_POLICY = {
  roles: [
    {
      name: 'all',
      kind: 'Everyone',
      permissions: ['*:AddProposal'],
    },
  ],
  proposal_bond: '100',
};

function stubViews() {
  viewNearContract.mockImplementation(
    async (_contractId: string, method: string) => {
      if (method === 'get_policy') return EVERYONE_POLICY;
      if (method === 'get_staking_contract') return '';
      if (method === 'delegation_balance_of') return '0';
      if (method === 'ft_balance_of') return '0';
      return null;
    }
  );
  viewAccount.mockResolvedValue({
    amount: '0',
    locked: '0',
    storage_usage: 0,
  });
}

describe('getProtocolGovernanceEligibility cache', () => {
  beforeEach(() => {
    invalidateProtocolGovernanceEligibility();
    viewNearContract.mockReset();
    viewAccount.mockReset();
    stubViews();
  });

  it('reuses a snapshot within the TTL', async () => {
    const first = await getProtocolGovernanceEligibility(
      'alice.near',
      'gov.near'
    );
    const second = await getProtocolGovernanceEligibility(
      'alice.near',
      'gov.near'
    );
    expect(second).toBe(first);
    expect(
      viewNearContract.mock.calls.filter(([, method]) => method === 'get_policy')
    ).toHaveLength(1);
  });

  it('reloads after invalidate and when fresh is requested', async () => {
    await getProtocolGovernanceEligibility('alice.near', 'gov.near');
    invalidateProtocolGovernanceEligibility('alice.near', 'gov.near');
    await getProtocolGovernanceEligibility('alice.near', 'gov.near');
    await getProtocolGovernanceEligibility('alice.near', 'gov.near', {
      fresh: true,
    });
    expect(
      viewNearContract.mock.calls.filter(([, method]) => method === 'get_policy')
    ).toHaveLength(3);
  });

  it('does not drop a different DAO when invalidating one pair', async () => {
    const gov = await getProtocolGovernanceEligibility('alice.near', 'gov.near');
    const treasury = await getProtocolGovernanceEligibility(
      'alice.near',
      'treasury.near'
    );
    invalidateProtocolGovernanceEligibility('alice.near', 'gov.near');
    const govAgain = await getProtocolGovernanceEligibility(
      'alice.near',
      'gov.near'
    );
    const treasuryAgain = await getProtocolGovernanceEligibility(
      'alice.near',
      'treasury.near'
    );
    expect(govAgain).not.toBe(gov);
    expect(treasuryAgain).toBe(treasury);
  });
});
