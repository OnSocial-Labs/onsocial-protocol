import { describe, expect, it } from 'vitest';
import { deriveProtocolPickerEligibility } from '@/features/protocol/protocol-picker-sheet';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

function eligibility(
  partial: Partial<ProtocolGovernanceEligibility>
): ProtocolGovernanceEligibility {
  return {
    daoAccountId: 'governance.onsocial.testnet',
    stakingContractId: 'staking.onsocial.testnet',
    requiredWeight: '1',
    delegatedWeight: '0',
    remainingToThreshold: '0',
    walletBalance: '0',
    nearBalance: '0',
    voteAmount: '0',
    availableToDelegate: '0',
    selfDelegatedWeight: '0',
    selfDelegationEntries: [],
    isRegistered: true,
    registrationStorageDeposit: '0',
    delegateActionNearStorageNeeded: '0',
    depositNeeded: '0',
    delegateNeeded: '0',
    isInCooldown: false,
    nextActionTimestamp: '0',
    cooldownRemainingNs: '0',
    availableToWithdraw: '0',
    canPropose: false,
    isGroupMember: false,
    canAddProposal: false,
    hasStakeProposePath: false,
    foreignStakeTokenLabel: null,
    proposalBond: '0',
    ...partial,
  };
}

const emptyPolicy: ProtocolDaoPolicy = {
  roles: [],
  proposal_bond: '0',
};

describe('deriveProtocolPickerEligibility', () => {
  it('offers SOCIAL stake only when this DAO has a Member path', () => {
    const next = deriveProtocolPickerEligibility(
      eligibility({
        canAddProposal: false,
        hasStakeProposePath: true,
        remainingToThreshold: '1000000000000000000',
      }),
      'alice.near',
      emptyPolicy,
      'ready'
    );
    expect(next.stakeBlocked).toBe(true);
    expect(next.roleBlocked).toBe(false);
    expect(next.remainingLabel).toBeTruthy();
  });

  it('blocks on role when the viewer cannot propose and there is no stake path', () => {
    const next = deriveProtocolPickerEligibility(
      eligibility({
        canAddProposal: false,
        hasStakeProposePath: false,
        remainingToThreshold: '1000000000000000000',
      }),
      'alice.near',
      emptyPolicy,
      'ready'
    );
    expect(next.stakeBlocked).toBe(false);
    expect(next.roleBlocked).toBe(true);
    expect(next.remainingLabel).toBeNull();
  });

  it('blocks on a named foreign token without offering SOCIAL stake', () => {
    const next = deriveProtocolPickerEligibility(
      eligibility({
        canAddProposal: false,
        hasStakeProposePath: false,
        foreignStakeTokenLabel: 'USDC',
      }),
      'alice.near',
      emptyPolicy,
      'ready'
    );
    expect(next.stakeBlocked).toBe(false);
    expect(next.foreignStakeBlocked).toBe(true);
    expect(next.roleBlocked).toBe(false);
    expect(next.foreignStakeTokenLabel).toBe('USDC');
  });

  it('is open when policy can add a proposal', () => {
    const next = deriveProtocolPickerEligibility(
      eligibility({
        canAddProposal: true,
        hasStakeProposePath: true,
        remainingToThreshold: '0',
      }),
      'alice.near',
      emptyPolicy,
      'ready'
    );
    expect(next.canProposeAny).toBe(true);
    expect(next.stakeBlocked).toBe(false);
    expect(next.roleBlocked).toBe(false);
  });
});
