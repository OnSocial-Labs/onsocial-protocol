import { describe, expect, it } from 'vitest';
import { resolveDaoProposeBondGate } from './dao-propose-confirm';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';

function eligibility(
  partial: Partial<ProtocolGovernanceEligibility>
): ProtocolGovernanceEligibility {
  return {
    daoAccountId: 'governance.onsocial.testnet',
    stakingContractId: 'staking.onsocial.testnet',
    requiredWeight: '1',
    delegatedWeight: '1',
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
    availableToWithdraw: '0',
    canPropose: true,
    isGroupMember: false,
    canAddProposal: true,
    hasStakeProposePath: true,
    foreignStakeTokenLabel: null,
    proposalBond: '100000000000000000000000', // 0.1 NEAR
    ...partial,
  };
}

describe('resolveDaoProposeBondGate', () => {
  it('blocks while loading or missing eligibility', () => {
    expect(resolveDaoProposeBondGate(null, true).canSubmit).toBe(false);
    expect(resolveDaoProposeBondGate(null).canSubmit).toBe(false);
  });

  it('needs stake when this DAO has a Member path and the wallet cannot propose', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        canPropose: false,
        canAddProposal: false,
        hasStakeProposePath: true,
        nearBalance: '1000000000000000000000000',
      })
    );
    expect(gate.needsStake).toBe(true);
    expect(gate.canSubmit).toBe(false);
  });

  it('does not offer SOCIAL stake when the DAO requires another token', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        canPropose: false,
        canAddProposal: false,
        hasStakeProposePath: false,
        foreignStakeTokenLabel: 'USDC',
        nearBalance: '1000000000000000000000000',
      })
    );
    expect(gate.needsStake).toBe(false);
    expect(gate.needsForeignStake).toBe(true);
    expect(gate.foreignStakeTokenLabel).toBe('USDC');
    expect(gate.canSubmit).toBe(false);
  });

  it('does not offer SOCIAL stake on a council-only DAO', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        canPropose: false,
        canAddProposal: false,
        hasStakeProposePath: false,
        isGroupMember: false,
        nearBalance: '1000000000000000000000000',
      })
    );
    expect(gate.needsStake).toBe(false);
    expect(gate.canPropose).toBe(false);
    expect(gate.canSubmit).toBe(false);
  });

  it('lets policy propose rights skip Member stake weight', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        canPropose: false,
        isGroupMember: true,
        canAddProposal: true,
        hasStakeProposePath: true,
        nearBalance: '200000000000000000000000',
      })
    );
    expect(gate.needsStake).toBe(false);
    expect(gate.canPropose).toBe(true);
    expect(gate.canSubmit).toBe(true);
  });

  it('does not treat a vote-only Group as propose rights', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        canPropose: false,
        isGroupMember: true,
        canAddProposal: false,
        hasStakeProposePath: false,
        nearBalance: '200000000000000000000000',
      })
    );
    expect(gate.canPropose).toBe(false);
    expect(gate.needsStake).toBe(false);
    expect(gate.canSubmit).toBe(false);
  });

  it('allows submit when propose-ready and bond covered', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        nearBalance: '200000000000000000000000',
      })
    );
    expect(gate.canPropose).toBe(true);
    expect(gate.bondOk).toBe(true);
    expect(gate.canSubmit).toBe(true);
    expect(gate.bondLabel).toContain('NEAR');
  });

  it('reports NEAR shortfall when bond exceeds wallet', () => {
    const gate = resolveDaoProposeBondGate(
      eligibility({
        nearBalance: '10000000000000000000000', // 0.01
      })
    );
    expect(gate.bondOk).toBe(false);
    expect(gate.canSubmit).toBe(false);
    expect(gate.shortfallNearLabel).toBeTruthy();
  });
});
