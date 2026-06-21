import { describe, expect, it } from 'vitest';
import { resolveGovernanceCreateNoActionsMessage, resolveGovernanceCreateBlockedSubmitLabel, resolveGovernancePolicyBlockedSubmitLabel } from '@/features/governance/governance-create-compact-ui';

describe('resolveGovernanceCreateNoActionsMessage', () => {
  const baseInput = {
    isDaoMember: false,
    hasEnoughDelegation: false,
    hasEnoughBond: true,
    remainingToThresholdDisplay: '500',
    bondDisplay: '1',
    baseProposalActionCount: 0,
    availableProposalActionCount: 0,
    hasPolicyActions: false,
  };

  it('returns null when proposal actions exist', () => {
    expect(
      resolveGovernanceCreateNoActionsMessage({
        ...baseInput,
        availableProposalActionCount: 1,
      })
    ).toBeNull();
  });

  it('explains delegation gap for public proposers', () => {
    expect(resolveGovernanceCreateNoActionsMessage(baseInput)).toEqual({
      kind: 'delegation',
      remainingToThresholdDisplay: '500',
    });
  });

  it('combines delegation and bond blockers', () => {
    expect(
      resolveGovernanceCreateNoActionsMessage({
        ...baseInput,
        hasEnoughBond: false,
      })
    ).toEqual({
      kind: 'delegation_and_bond',
      remainingToThresholdDisplay: '500',
      bondDisplay: '1',
    });
  });

  it('routes policy-only users to policy copy', () => {
    expect(
      resolveGovernanceCreateNoActionsMessage({
        ...baseInput,
        hasPolicyActions: true,
      })
    ).toEqual({ kind: 'policy_only' });
  });

  it('explains chain capability gaps when policy allows proposals', () => {
    expect(
      resolveGovernanceCreateNoActionsMessage({
        ...baseInput,
        baseProposalActionCount: 2,
      })
    ).toEqual({ kind: 'chain_unavailable' });
  });
});

describe('resolveGovernanceCreateBlockedSubmitLabel', () => {
  it('returns short propose CTA for delegation blockers', () => {
    expect(
      resolveGovernanceCreateBlockedSubmitLabel({
        kind: 'delegation',
        remainingToThresholdDisplay: '500',
      })
    ).toBe('Delegate 500 SOCIAL to propose');
  });
});

describe('resolveGovernancePolicyBlockedSubmitLabel', () => {
  it('returns short CTA for missing policy permissions', () => {
    expect(
      resolveGovernancePolicyBlockedSubmitLabel({
        isConnected: true,
        canEditPolicy: false,
        canCoverBond: true,
        bondDisplay: '1',
        availablePolicyActionCount: 0,
        canProposeSelectedPolicyAction: false,
      })
    ).toBe('No policy permissions');
  });

  it('returns bond CTA before form validation blockers', () => {
    expect(
      resolveGovernancePolicyBlockedSubmitLabel({
        isConnected: true,
        canEditPolicy: true,
        canCoverBond: false,
        bondDisplay: '1',
        availablePolicyActionCount: 2,
        canProposeSelectedPolicyAction: true,
      })
    ).toBe('Add 1 NEAR bond to propose');
  });
});
