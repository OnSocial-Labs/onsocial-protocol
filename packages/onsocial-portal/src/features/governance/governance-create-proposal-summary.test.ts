import { describe, expect, it } from 'vitest';
import { BOUNDED_NOTE_CHARACTER_ERROR } from '@/lib/bounded-note-field';
import {
  resolveGovernanceCreateOutcomeLine,
  resolveGovernanceCreateProposalSummary,
  resolveGovernanceCreateSubmitFeedback,
} from '@/features/governance/governance-create-proposal-summary';
import {
  resolveGovernanceCreateDescriptionPlaceholder,
} from '@/features/governance/governance-proposal-builders';
import { DEFAULT_BOOST_POST_ROUTING_DRAFT } from '@/lib/dao-contract-config-operations';

const base = {
  proposalAction: 'transfer' as const,
  transferAmountInput: '',
  transferAmountSmallest: null,
  transferTokenSymbol: null,
  transferReceiverId: '',
  socialSpendSeasonId: '',
  socialSpendAmountInput: '',
  boostInfraAmountInput: '',
  isWithdrawBoostInfraAction: false,
  isSetBoostInfraAuthorityAction: false,
  treasuryDaoAccountId: 'treasury.onsocial.testnet',
  roleId: 'council',
  subjectAccountId: 'alice.testnet',
  isAddMemberAction: false,
  isRemoveMemberAction: false,
  contractUpgradeContractLabel: null,
  contractUpgradeCodeHash: null,
  transferOwnershipContractLabel: null,
  transferOwnershipNewOwnerId: '',
  contractConfigOperationLabel: null,
  isContractConfigAction: false,
  isSocialSpendRoutingConfig: false,
  isSeasonConfigConfig: false,
  contractConfigOperationId: '' as const,
  actionRoutingDraft: null,
  actionRoutingBaseline: null,
  actionRoutingLoading: false,
  actionRoutingLoadError: null,
  seasonConfigDraft: null,
  seasonConfigBaseline: null,
  seasonConfigLoading: false,
  seasonConfigLoadError: null,
  seasonConfigNewSeasonOnChain: false,
};

describe('resolveGovernanceCreateProposalSummary', () => {
  it('describes transfer proposals with a secondary-free summary', () => {
    expect(
      resolveGovernanceCreateProposalSummary({
        ...base,
        transferAmountInput: '10',
        transferAmountSmallest: '10000000000000000000',
        transferTokenSymbol: 'SOCIAL',
        transferReceiverId: 'bob.testnet',
      })
    ).toEqual({
      primary: 'Send 10 SOCIAL → @bob.testnet',
      secondary: null,
      secondaryWarning: false,
    });
  });

  it('summarizes routing config with chain status', () => {
    const draft = { ...DEFAULT_BOOST_POST_ROUTING_DRAFT };

    expect(
      resolveGovernanceCreateProposalSummary({
        ...base,
        proposalAction: 'contract_config',
        isContractConfigAction: true,
        isSocialSpendRoutingConfig: true,
        contractConfigOperationId: 'social_spend_boost_post_routing',
        contractConfigOperationLabel: 'Boost post routing',
        actionRoutingDraft: draft,
        actionRoutingBaseline: draft,
      })
    ).toEqual({
      primary: expect.stringContaining('10% boost credits'),
      secondary: 'Matches chain',
      secondaryWarning: false,
    });
  });

  it('reports routing validation on the secondary line', () => {
    const summary = resolveGovernanceCreateProposalSummary({
      ...base,
      proposalAction: 'contract_config',
      isContractConfigAction: true,
      isSocialSpendRoutingConfig: true,
      contractConfigOperationId: 'social_spend_boost_post_routing',
      contractConfigOperationLabel: 'Boost post routing',
      actionRoutingDraft: {
        ...DEFAULT_BOOST_POST_ROUTING_DRAFT,
        treasury_bps: 5000,
        target_bps: 4000,
      },
      actionRoutingBaseline: DEFAULT_BOOST_POST_ROUTING_DRAFT,
    });

    expect(summary?.secondary).toBe('Shares must total 100%.');
    expect(summary?.primary).toContain('50% boost credits');
    expect(summary?.primary).not.toContain('Update boost post routing');
  });
});

describe('resolveGovernanceCreateSubmitFeedback', () => {
  it('suppresses contract-config validation when summary already warns', () => {
    expect(
      resolveGovernanceCreateSubmitFeedback({
        error: '',
        blockedReason: 'Routing shares must sum to 100% (10,000 bps).',
        proposalSummary: {
          primary: 'min 0.01 SOCIAL · 50% boost credits · 40% target',
          secondary: 'Shares must total 100%.',
          secondaryWarning: true,
        },
        isContractConfigAction: true,
        isSocialSpendRoutingConfig: true,
        isSeasonConfigConfig: false,
      })
    ).toBeNull();
  });

  it('keeps unrelated blocked reasons', () => {
    expect(
      resolveGovernanceCreateSubmitFeedback({
        error: '',
        blockedReason: 'Amount exceeds DAO SOCIAL balance.',
        proposalSummary: {
          primary: 'Fund @season-two with 500 SOCIAL',
          secondary: null,
          secondaryWarning: false,
        },
        isContractConfigAction: false,
        isSocialSpendRoutingConfig: false,
        isSeasonConfigConfig: false,
      })
    ).toBe('Amount exceeds DAO SOCIAL balance.');
  });

  it('suppresses description character errors handled inline', () => {
    expect(
      resolveGovernanceCreateSubmitFeedback({
        error: '',
        blockedReason: BOUNDED_NOTE_CHARACTER_ERROR,
        proposalSummary: null,
        isContractConfigAction: false,
        isSocialSpendRoutingConfig: false,
        isSeasonConfigConfig: false,
      })
    ).toBeNull();
  });
});

describe('resolveGovernanceCreateDescriptionPlaceholder', () => {
  it('returns action-specific placeholder copy', () => {
    expect(resolveGovernanceCreateDescriptionPlaceholder('idea')).toBe(
      'What should the DAO consider?'
    );
    expect(
      resolveGovernanceCreateDescriptionPlaceholder('add_member', 'partners')
    ).toBe('Why they should join partners');
  });
});

describe('resolveGovernanceCreateOutcomeLine', () => {
  it('remains available for legacy callers', () => {
    expect(
      resolveGovernanceCreateOutcomeLine({
        ...base,
        transferAmountInput: '10',
        transferAmountSmallest: '10000000000000000000',
        transferTokenSymbol: 'SOCIAL',
        transferReceiverId: 'bob.testnet',
      })
    ).toBe('Send 10 SOCIAL → @bob.testnet');
  });
});
