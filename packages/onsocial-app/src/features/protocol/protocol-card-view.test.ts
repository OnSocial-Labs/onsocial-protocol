import { describe, expect, it } from 'vitest';
import {
  normalizeProtocolDaoAccountId,
  resolveKnownBoardForDaoAccount,
  resolveProtocolDaoAccountId,
  resolveProtocolDaoBoard,
} from '@/features/protocol/dao-accounts';
import {
  applyOptimisticVote,
  deriveProtocolProposalView,
  statusLabel,
  sumVoteCounts,
} from '@/features/protocol/protocol-card-view';
import {
  buildProtocolCreatePayload,
  buildProtocolMemberProposalPayload,
  buildProtocolSignalProposalPayload,
  buildProtocolTransferProposalPayload,
} from '@/features/protocol/protocol-create';
import {
  buildProtocolOwnershipPayload,
  buildProtocolUpgradePayload,
  normalizePublishedCodeHash,
} from '@/features/protocol/protocol-contracts';
import {
  buildProtocolPolicyPayload,
  daysToProposalPeriodNs,
  getRemoveProtocolPolicyRoleBlockReason,
  parseVoteThresholdInputs,
  preserveNonEditableRolePermissions,
} from '@/features/protocol/protocol-policy';
import {
  canProposeProtocolCreateKind,
  canProposeProtocolPolicyAction,
} from '@/features/protocol/protocol-propose-gate';
import { buildProtocolDelegationPlan } from '@/features/protocol/protocol-staking';
import { BOOST_CONTRACT } from '@/lib/app-config';
import type {
  ProtocolApplication,
  ProtocolDaoPolicy,
  ProtocolDaoProposal,
} from '@/features/protocol/types';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { parseProtocolDaoBoard, protocolPath } from '@/lib/app-routes';

describe('protocol dao boards', () => {
  it('resolves governance, treasury, and community accounts', () => {
    expect(resolveProtocolDaoAccountId('governance')).toBe(
      GOVERNANCE_DAO_ACCOUNT
    );
    expect(resolveProtocolDaoAccountId('treasury')).toBe(TREASURY_DAO_ACCOUNT);
    expect(resolveProtocolDaoAccountId('community')).toBeNull();
    expect(
      resolveProtocolDaoAccountId('community', 'example.sputnik-dao.near')
    ).toBe('example.sputnik-dao.near');
    expect(resolveProtocolDaoBoard(TREASURY_DAO_ACCOUNT)).toBe('treasury');
    expect(resolveKnownBoardForDaoAccount(GOVERNANCE_DAO_ACCOUNT)).toBe(
      'governance'
    );
    expect(resolveKnownBoardForDaoAccount('other.near')).toBeNull();
    expect(normalizeProtocolDaoAccountId('!!!')).toBeNull();
    expect(normalizeProtocolDaoAccountId('Bad Account')).toBeNull();
    expect(normalizeProtocolDaoAccountId('  Example.near  ')).toBe(
      'example.near'
    );
    expect(parseProtocolDaoBoard('community')).toBe('community');
    expect(protocolPath({ board: 'treasury' })).toBe('/protocol?dao=treasury');
    expect(protocolPath({ board: 'community' })).toBe(
      '/protocol?dao=community'
    );
    expect(
      protocolPath({ board: 'community', account: 'example.sputnik-dao.near' })
    ).toBe('/protocol?dao=community&account=example.sputnik-dao.near');
    expect(protocolPath()).toBe('/protocol');
    expect(protocolPath({ proposal: 12 })).toBe('/protocol?proposal=12');
    expect(protocolPath({ status: 'approved', proposal: 3 })).toBe(
      '/protocol?status=approved&proposal=3'
    );
    expect(protocolPath({ board: 'treasury', status: 'open' })).toBe(
      '/protocol?dao=treasury&status=open'
    );
  });
});

describe('protocol create + stake helpers', () => {
  it('builds a signal proposal payload', () => {
    expect(buildProtocolSignalProposalPayload(' Ship the upgrade ')).toEqual({
      proposal: {
        description: 'Ship the upgrade',
        kind: { Vote: null },
      },
    });
    expect(() => buildProtocolSignalProposalPayload('   ')).toThrow(
      /Signal description/
    );
  });

  it('builds membership and transfer payloads', () => {
    expect(
      buildProtocolMemberProposalPayload({
        add: true,
        memberId: 'alice.testnet',
        roleId: 'council',
      }).proposal.kind
    ).toEqual({
      AddMemberToRole: { member_id: 'alice.testnet', role: 'council' },
    });
    expect(
      buildProtocolCreatePayload({
        kind: 'leave_self',
        accountId: 'alice.testnet',
        description: '',
        roleId: 'council',
      }).proposal.kind
    ).toEqual({
      RemoveMemberFromRole: { member_id: 'alice.testnet', role: 'council' },
    });
    expect(
      buildProtocolTransferProposalPayload({
        receiverId: 'bob.testnet',
        amountYocto: '1000000000000000000000000',
      }).proposal.kind
    ).toMatchObject({
      Transfer: {
        receiver_id: 'bob.testnet',
        amount: '1000000000000000000000000',
        token_id: '',
      },
    });
  });

  it('builds settings proposals', () => {
    expect(daysToProposalPeriodNs('7')).toBe(
      String(7n * 24n * 60n * 60n * 1_000_000_000n)
    );
    expect(parseVoteThresholdInputs('1', '2')).toEqual([1, 2]);
    expect(
      buildProtocolPolicyPayload({
        actionId: 'update_parameters',
        policy: null,
        proposalBondYocto: '1000000000000000000000000',
      }).proposal.kind
    ).toEqual({
      ChangePolicyUpdateParameters: {
        parameters: { proposal_bond: '1000000000000000000000000' },
      },
    });

    const policy: ProtocolDaoPolicy = {
      roles: [
        {
          name: 'guardians',
          kind: { Group: ['alice.testnet', 'bob.testnet'] },
          permissions: ['*:*'],
        },
        {
          name: 'delegated_proposers',
          kind: { Member: '100' },
          permissions: ['call:AddProposal', 'vote:AddProposal'],
          vote_policy: {},
        },
        {
          name: 'proposers',
          kind: { Member: '50' },
          permissions: [
            'vote:AddProposal',
            '*:VoteApprove',
            '*:Finalize',
          ],
        },
      ],
    };

    expect(
      buildProtocolPolicyPayload({
        actionId: 'add_role',
        policy,
        newRoleName: 'Reviewers',
        addRoleAccessMode: 'full_access',
      }).proposal.kind
    ).toMatchObject({
      ChangePolicyAddOrUpdateRole: {
        role: {
          name: 'reviewers',
          kind: { Group: ['alice.testnet', 'bob.testnet'] },
          permissions: ['*:*'],
        },
      },
    });

    expect(
      buildProtocolPolicyPayload({
        actionId: 'add_role',
        policy,
        newRoleName: 'writers',
        addRoleAccessMode: 'custom',
        addRolePermissions: ['vote:AddProposal', 'transfer:AddProposal'],
      }).proposal.kind
    ).toMatchObject({
      ChangePolicyAddOrUpdateRole: {
        role: {
          name: 'writers',
          kind: { Member: '100' },
          permissions: ['vote:AddProposal', 'transfer:AddProposal'],
        },
      },
    });

    expect(
      preserveNonEditableRolePermissions(policy.roles![2]!, [
        'vote:AddProposal',
        'transfer:AddProposal',
      ])
    ).toEqual([
      '*:VoteApprove',
      '*:Finalize',
      'vote:AddProposal',
      'transfer:AddProposal',
    ]);

    expect(
      buildProtocolPolicyPayload({
        actionId: 'update_permissions',
        policy,
        permissionsRoleId: 'proposers',
        permissions: ['vote:AddProposal', 'transfer:AddProposal'],
      }).proposal.kind
    ).toMatchObject({
      ChangePolicyAddOrUpdateRole: {
        role: {
          name: 'proposers',
          permissions: [
            '*:VoteApprove',
            '*:Finalize',
            'vote:AddProposal',
            'transfer:AddProposal',
          ],
        },
      },
    });

    expect(
      getRemoveProtocolPolicyRoleBlockReason(policy, 'guardians')
    ).toMatch(/only full-access role/);
    expect(() =>
      buildProtocolPolicyPayload({
        actionId: 'remove_role',
        policy,
        removeRoleId: 'guardians',
      })
    ).toThrow(/only full-access role/);
    expect(
      buildProtocolPolicyPayload({
        actionId: 'remove_role',
        policy,
        removeRoleId: 'proposers',
      }).proposal.kind
    ).toEqual({ ChangePolicyRemoveRole: { role: 'proposers' } });
  });

  it('gates create and settings actions by role permissions', () => {
    const policy: ProtocolDaoPolicy = {
      roles: [
        {
          name: 'guardians',
          kind: { Group: ['alice.testnet'] },
          permissions: ['*:*'],
        },
        {
          name: 'delegated_proposers',
          kind: { Member: '100' },
          permissions: ['vote:AddProposal', 'transfer:AddProposal'],
        },
      ],
    };

    expect(
      canProposeProtocolCreateKind(policy, 'alice.testnet', '0', 'contract_upgrade')
    ).toBe(true);
    expect(
      canProposeProtocolCreateKind(policy, 'bob.testnet', '50', 'signal')
    ).toBe(false);
    expect(
      canProposeProtocolCreateKind(policy, 'bob.testnet', '100', 'signal')
    ).toBe(true);
    expect(
      canProposeProtocolCreateKind(policy, 'bob.testnet', '100', 'contract_upgrade')
    ).toBe(false);
    expect(
      canProposeProtocolPolicyAction(
        policy,
        'alice.testnet',
        '0',
        'update_permissions'
      )
    ).toBe(true);
    expect(
      canProposeProtocolPolicyAction(
        policy,
        'bob.testnet',
        '100',
        'update_permissions'
      )
    ).toBe(false);
  });

  it('builds contract ownership and upgrade payloads', () => {
    expect(
      buildProtocolOwnershipPayload({
        contractId: BOOST_CONTRACT,
        newOwnerId: 'alice.testnet',
      }).proposal.kind
    ).toMatchObject({
      FunctionCall: {
        receiver_id: BOOST_CONTRACT,
        actions: [{ method_name: 'set_owner' }],
      },
    });
    expect(() => normalizePublishedCodeHash('bad')).toThrow(/code hash/);
    const hash = '11111111111111111111111111111111111111111111';
    expect(
      buildProtocolUpgradePayload({
        contractId: BOOST_CONTRACT,
        codeHash: hash,
      }).proposal.kind
    ).toMatchObject({
      FunctionCall: {
        receiver_id: BOOST_CONTRACT,
        actions: [{ method_name: 'update_contract_from_hash' }],
      },
    });
    expect(
      buildProtocolCreatePayload({
        kind: 'set_boost_infra_authority',
        accountId: 'alice.testnet',
        description: '',
        authorityId: 'treasury.onsocial.testnet',
      }).proposal.kind
    ).toMatchObject({
      FunctionCall: {
        actions: [{ method_name: 'set_infra_withdraw_authority' }],
      },
    });
  });

  it('plans delegation deposit when stake balance is short', () => {
    const eligibility: ProtocolGovernanceEligibility = {
      daoAccountId: GOVERNANCE_DAO_ACCOUNT,
      stakingContractId: 'staking-governance.onsocial.testnet',
      requiredWeight: '100',
      delegatedWeight: '0',
      remainingToThreshold: '100',
      walletBalance: '80',
      nearBalance: '1000000000000000000000000',
      voteAmount: '20',
      availableToDelegate: '20',
      selfDelegatedWeight: '0',
      selfDelegationEntries: [],
      isRegistered: true,
      registrationStorageDeposit: '0',
      delegateActionNearStorageNeeded: '0',
      depositNeeded: '80',
      delegateNeeded: '20',
      isInCooldown: false,
      nextActionTimestamp: '0',
      cooldownRemainingNs: '0',
      availableToWithdraw: '20',
      canPropose: false,
      isGroupMember: false,
      canAddProposal: false,
      hasStakeProposePath: true,
      foreignStakeTokenLabel: null,
      proposalBond: '0',
    };
    const plan = buildProtocolDelegationPlan(eligibility, 100n);
    expect(plan.depositAmount).toBe('80');
    expect(plan.delegateAmount).toBe('100');
    expect(plan.storageDeposit).toBe('0');
    expect(plan.needsBatch).toBe(true);
  });
});

describe('protocol card view', () => {
  const proposal: ProtocolDaoProposal = {
    id: 12,
    proposer: 'alice.testnet',
    description: 'Upgrade boost contract to cleaned artifact',
    kind: { FunctionCall: { receiver_id: 'boost.onsocial.testnet' } },
    status: 'InProgress',
    vote_counts: { council: ['1', '0', '0'] },
    votes: { 'bob.testnet': 'Approve' },
    submission_time: String(BigInt(Date.now()) * 1_000_000n),
  };

  const policy: ProtocolDaoPolicy = {
    proposal_period: String(7n * 24n * 60n * 60n * 1_000_000_000n),
    default_vote_policy: {
      quorum: '0',
      threshold: [1, 2],
      weight_kind: 'RoleWeight',
    },
    roles: [
      {
        name: 'council',
        kind: { Group: ['alice.testnet', 'bob.testnet'] },
        permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
      },
    ],
  };

  const application: ProtocolApplication = {
    app_id: 'protocol-proposal-12',
    label: 'Boost',
    status: 'approved',
    description: null,
    created_at: '1',
    protocol_kind: 'upgrade',
    protocol_subject: 'Boost contract',
    protocol_target_account: 'boost.onsocial.testnet',
    protocol_target_method: 'update_contract_from_hash',
    governance_proposal: {
      proposal_id: 12,
      status: 'InProgress',
      description: proposal.description,
      dao_account: GOVERNANCE_DAO_ACCOUNT,
      tx_hash: null,
      submitted_at: proposal.submission_time,
      snapshot: proposal,
    },
  };

  it('sums votes and labels status', () => {
    expect(sumVoteCounts(proposal.vote_counts, 0)).toBe(1);
    expect(statusLabel('InProgress')).toBe('In review');
  });

  it('derives full on-page card view', () => {
    const view = deriveProtocolProposalView({
      application,
      accountId: 'alice.testnet',
      daoPolicy: policy,
    });
    expect(view.headline).toBe('Upgrade boost contract to cleaned artifact');
    expect(view.actionBadge).toBe('Call');
    expect(view.description).toContain('Upgrade boost');
    expect(view.targetAccount).toBe('boost.onsocial.testnet');
    expect(view.canApprove).toBe(true);
    expect(view.canReject).toBe(true);
    expect(view.votingProgress.threshold).toBe(1);
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.submission).not.toBeNull();
    expect(view.deadline).not.toBeNull();
  });

  it('blocks a second vote for the same guardian', () => {
    const view = deriveProtocolProposalView({
      application,
      accountId: 'bob.testnet',
      daoPolicy: policy,
    });
    expect(view.canApprove).toBe(false);
    expect(view.currentVote).toBe('Approve');
  });

  it('applies optimistic votes', () => {
    const next = applyOptimisticVote(proposal, 'alice.testnet', 'Approve');
    expect(next.votes['alice.testnet']).toBe('Approve');
    expect(sumVoteCounts(next.vote_counts, 0)).toBe(2);
  });

  it('enables finalize after the review window closes', () => {
    const expiredProposal: ProtocolDaoProposal = {
      ...proposal,
      status: 'Expired',
    };
    const expiredApp: ProtocolApplication = {
      ...application,
      governance_proposal: {
        ...application.governance_proposal!,
        status: 'Expired',
        snapshot: expiredProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: expiredApp,
      accountId: 'alice.testnet',
      daoPolicy: policy,
    });
    expect(view.canFinalize).toBe(true);
    expect(view.finalizeLabel).toBe('Finalize');
    expect(view.canApprove).toBe(false);
  });
});
