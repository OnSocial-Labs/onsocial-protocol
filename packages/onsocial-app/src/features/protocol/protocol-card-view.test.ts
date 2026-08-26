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
  getProtocolProposalVotesCast,
  mergeProtocolFeedApplications,
  mergeProtocolProposalSnapshot,
  shouldAdoptProtocolProposalSnapshot,
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
    expect(view.votingProgress.threshold).toBe(2);
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
    const next = applyOptimisticVote(
      proposal,
      'alice.testnet',
      'Approve',
      policy
    );
    expect(next.votes['alice.testnet']).toBe('Approve');
    expect(sumVoteCounts(next.vote_counts, 0)).toBe(2);
  });

  it('does not regress terminal status when feed refresh is stale', () => {
    const approved: ProtocolDaoProposal = {
      ...proposal,
      status: 'Approved',
      vote_counts: { council: ['2', '0', '0'] },
      votes: {
        'alice.testnet': 'Approve',
        'bob.testnet': 'Approve',
      },
    };
    const staleOpen: ProtocolDaoProposal = {
      ...approved,
      status: 'InProgress',
    };
    expect(shouldAdoptProtocolProposalSnapshot(approved, staleOpen)).toBe(
      false
    );
    expect(
      mergeProtocolProposalSnapshot(approved, staleOpen)?.status
    ).toBe('Approved');
  });

  it('keeps fresher vote counts when feed refresh is stale', () => {
    const optimistic = applyOptimisticVote(
      proposal,
      'alice.testnet',
      'Approve',
      policy
    );
    const staleRefresh: ProtocolDaoProposal = { ...proposal };
    expect(getProtocolProposalVotesCast(optimistic)).toBe(2);
    expect(getProtocolProposalVotesCast(staleRefresh)).toBe(1);
    expect(shouldAdoptProtocolProposalSnapshot(optimistic, staleRefresh)).toBe(
      false
    );
    const merged = mergeProtocolProposalSnapshot(optimistic, staleRefresh);
    expect(sumVoteCounts(merged?.vote_counts, 0)).toBe(2);
    expect(merged?.votes['alice.testnet']).toBe('Approve');
  });

  it('merges feed rows without regressing confirmed vote snapshots', () => {
    const optimistic = applyOptimisticVote(
      proposal,
      'alice.testnet',
      'Approve',
      policy
    );
    const currentApp: ProtocolApplication = {
      ...application,
      governance_proposal: {
        ...application.governance_proposal!,
        snapshot: optimistic,
      },
    };
    const staleFeedApp: ProtocolApplication = {
      ...application,
      governance_proposal: {
        ...application.governance_proposal!,
        snapshot: proposal,
      },
    };
    const merged = mergeProtocolFeedApplications(
      [currentApp],
      [staleFeedApp]
    );
    expect(sumVoteCounts(merged[0]?.governance_proposal?.snapshot?.vote_counts, 0)).toBe(
      2
    );
  });

  it('keeps add-member vote pool stable when nominee appears in refreshed policy', () => {
    const addProposal: ProtocolDaoProposal = {
      id: 21,
      proposer: 'alice.testnet',
      description: 'Add berry to council',
      kind: { AddMemberToRole: { member_id: 'berry.testnet', role: 'council' } },
      status: 'InProgress',
      vote_counts: { council: ['2', '0', '0'] },
      votes: {
        'alice.testnet': 'Approve',
        'bob.testnet': 'Approve',
      },
      submission_time: String(BigInt(Date.now()) * 1_000_000n),
    };
    const policyWithNominee: ProtocolDaoPolicy = {
      proposal_period: String(7n * 24n * 60n * 60n * 1_000_000_000n),
      default_vote_policy: {
        quorum: '0',
        threshold: [1, 2],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.testnet', 'bob.testnet', 'berry.testnet'] },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const addApp: ProtocolApplication = {
      app_id: 'protocol-proposal-21',
      label: 'Join',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'join',
      protocol_subject: 'berry.testnet',
      governance_proposal: {
        proposal_id: 21,
        status: 'InProgress',
        description: addProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: addProposal.submission_time,
        snapshot: addProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: addApp,
      accountId: 'alice.testnet',
      daoPolicy: policyWithNominee,
    });
    expect(view.eligibleVoters).toEqual(['alice.testnet', 'bob.testnet']);
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.votingProgress.approvals).toBe(2);
  });

  it('shows vote-time 2/2 on approved add-member after nominee joins policy', () => {
    const addProposal: ProtocolDaoProposal = {
      id: 54,
      proposer: 'voter2.onsocial.testnet',
      description: 'Add Berry to guardians',
      kind: {
        AddMemberToRole: {
          member_id: 'berrysamba.testnet',
          role: 'guardians',
        },
      },
      status: 'Approved',
      vote_counts: { guardians: ['2', '0', '0'] },
      votes: {
        'voter1.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
      submission_time: '1',
      policy_snapshot: {
        roles: [
          {
            name: 'guardians',
            kind: { Group: ['voter1.onsocial.testnet', 'voter2.onsocial.testnet'] },
          },
        ],
      },
    };
    const policyWithNominee: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [1, 2],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'voter1.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const addApp: ProtocolApplication = {
      app_id: 'protocol-proposal-54',
      label: 'Join',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'join',
      protocol_subject: 'berrysamba.testnet',
      governance_proposal: {
        proposal_id: 54,
        status: 'Approved',
        description: addProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: addProposal.submission_time,
        snapshot: addProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: addApp,
      accountId: 'voter2.onsocial.testnet',
      daoPolicy: policyWithNominee,
    });
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.voteEntries).toHaveLength(2);
  });

  it('uses role-specific vote policy labels for threshold math', () => {
    const callProposal: ProtocolDaoProposal = {
      ...proposal,
      kind: { FunctionCall: { receiver_id: 'boost.onsocial.testnet' } },
    };
    const rolePolicy: ProtocolDaoPolicy = {
      ...policy,
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.testnet', 'bob.testnet'] },
          permissions: ['call:VoteApprove', 'call:VoteReject', '*:Finalize'],
          vote_policy: {
            call: {
              quorum: '0',
              threshold: [2, 2],
              weight_kind: 'RoleWeight',
            },
          },
        },
      ],
    };
    const view = deriveProtocolProposalView({
      application: {
        ...application,
        governance_proposal: {
          ...application.governance_proposal!,
          snapshot: callProposal,
        },
      },
      accountId: 'alice.testnet',
      daoPolicy: rolePolicy,
    });
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.canApprove).toBe(true);
  });

  it('expands remove-member vote pool while subject is still in role', () => {
    const removeProposal: ProtocolDaoProposal = {
      id: 9,
      proposer: 'alice.testnet',
      description: 'Remove bob',
      kind: {
        RemoveMemberFromRole: { member_id: 'bob.testnet', role: 'council' },
      },
      status: 'InProgress',
      vote_counts: { council: ['0', '0', '0'] },
      votes: {},
      submission_time: String(BigInt(Date.now()) * 1_000_000n),
    };
    const removeApp: ProtocolApplication = {
      ...application,
      app_id: 'protocol-proposal-9',
      governance_proposal: {
        ...application.governance_proposal!,
        proposal_id: 9,
        snapshot: removeProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: removeApp,
      accountId: 'alice.testnet',
      daoPolicy: policy,
    });
    expect(view.eligibleVoters).toEqual(['alice.testnet', 'bob.testnet']);
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
  });

  it('blocks voting after the review window closes', () => {
    const staleMs = Date.now() - 8 * 86_400_000;
    const staleProposal: ProtocolDaoProposal = {
      ...proposal,
      submission_time: String(BigInt(staleMs) * 1_000_000n),
    };
    const staleApp: ProtocolApplication = {
      ...application,
      governance_proposal: {
        ...application.governance_proposal!,
        snapshot: staleProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: staleApp,
      accountId: 'alice.testnet',
      daoPolicy: policy,
      nowMs: Date.now(),
    });
    expect(view.canApprove).toBe(false);
    expect(view.canFinalize).toBe(true);
  });

  it('uses vote-time pool on terminal proposals when live policy grew', () => {
    const approvedProposal: ProtocolDaoProposal = {
      ...proposal,
      kind: { ChangeConfig: { config: { purpose: 'test' } } },
      status: 'Approved',
      vote_counts: { council: ['2', '0', '0'] },
      votes: {
        'alice.testnet': 'Approve',
        'bob.testnet': 'Approve',
      },
      policy_snapshot: {
        roles: [
          {
            name: 'council',
            kind: { Group: ['alice.testnet', 'bob.testnet'] },
          },
        ],
      },
    };
    const threeMemberPolicy: ProtocolDaoPolicy = {
      ...policy,
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.testnet', 'bob.testnet', 'carol.testnet'] },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const view = deriveProtocolProposalView({
      application: {
        ...application,
        governance_proposal: {
          ...application.governance_proposal!,
          status: 'Approved',
          snapshot: approvedProposal,
        },
      },
      accountId: 'alice.testnet',
      daoPolicy: threeMemberPolicy,
    });
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
  });

  it('shows vote-time 2/2 on terminal policy proposals when council grew later', () => {
    const approvedProposal: ProtocolDaoProposal = {
      ...proposal,
      kind: {
        ChangePolicyRemoveRole: {
          role: 'partner_proposers',
        },
      },
      status: 'Approved',
      vote_counts: { guardians: ['2', '0', '0'] },
      votes: {
        'greenghost.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
    };
    const threeMemberPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [50, 100],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'greenghost.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const view = deriveProtocolProposalView({
      application: {
        ...application,
        governance_proposal: {
          ...application.governance_proposal!,
          status: 'Approved',
          snapshot: approvedProposal,
        },
      },
      accountId: 'greenghost.onsocial.testnet',
      daoPolicy: threeMemberPolicy,
    });
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.eligibleVoters).toEqual([
      'greenghost.onsocial.testnet',
      'voter2.onsocial.testnet',
    ]);
  });

  it('shows vote-time 2/2 on approved add-member when nominee was later removed', () => {
    const addProposal: ProtocolDaoProposal = {
      id: 37,
      proposer: 'berrysamba.testnet',
      description: 'Add test05 to guardians',
      kind: {
        AddMemberToRole: {
          member_id: 'test05.onsocial.testnet',
          role: 'guardians',
        },
      },
      status: 'Approved',
      vote_counts: { guardians: ['2', '0', '0'] },
      votes: {
        'greenghost.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
      submission_time: '1',
    };
    const currentPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [50, 100],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'greenghost.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const addApp: ProtocolApplication = {
      app_id: 'protocol-proposal-37',
      label: 'Join',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'join',
      protocol_subject: 'test05.onsocial.testnet',
      governance_proposal: {
        proposal_id: 37,
        status: 'Approved',
        description: addProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: addProposal.submission_time,
        snapshot: addProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: addApp,
      accountId: 'greenghost.onsocial.testnet',
      daoPolicy: currentPolicy,
    });
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.eligibleVoters).toEqual([
      'greenghost.onsocial.testnet',
      'voter2.onsocial.testnet',
    ]);
  });

  it('shows vote-time 2/3 on approved remove-member when leaver did not vote', () => {
    const removeProposal: ProtocolDaoProposal = {
      id: 55,
      proposer: 'greenghost.onsocial.testnet',
      description: 'Remove from Guardians',
      kind: {
        RemoveMemberFromRole: {
          member_id: 'berrysamba.testnet',
          role: 'guardians',
        },
      },
      status: 'Approved',
      vote_counts: { guardians: ['2', '0', '0'] },
      votes: {
        'voter1.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
      submission_time: '1',
    };
    const postRemovalPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [1, 2],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: ['voter1.onsocial.testnet', 'voter2.onsocial.testnet'],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const removeApp: ProtocolApplication = {
      app_id: 'protocol-proposal-55',
      label: 'Leave',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'leave',
      protocol_subject: 'berrysamba.testnet',
      governance_proposal: {
        proposal_id: 55,
        status: 'Approved',
        description: removeProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: removeProposal.submission_time,
        snapshot: removeProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: removeApp,
      accountId: 'voter1.onsocial.testnet',
      daoPolicy: postRemovalPolicy,
    });
    expect(view.votingProgress.totalWeight).toBe(3);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.approveVotes).toBe(2);
    expect(view.eligibleVoters).toEqual([
      'voter1.onsocial.testnet',
      'voter2.onsocial.testnet',
      'berrysamba.testnet',
    ]);
  });

  it('shows vote-time 2/3 on approved remove when subject later left and council grew', () => {
    const removeProposal: ProtocolDaoProposal = {
      id: 38,
      proposer: 'berrysamba.testnet',
      description: 'Remove test05 from guardians',
      kind: {
        RemoveMemberFromRole: {
          member_id: 'test05.onsocial.testnet',
          role: 'guardians',
        },
      },
      status: 'Approved',
      vote_counts: { guardians: ['2', '0', '0'] },
      votes: {
        'test05.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
      submission_time: '1',
    };
    const currentPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [50, 100],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'greenghost.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const removeApp: ProtocolApplication = {
      app_id: 'protocol-proposal-38',
      label: 'Leave',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'leave',
      protocol_subject: 'test05.onsocial.testnet',
      governance_proposal: {
        proposal_id: 38,
        status: 'Approved',
        description: removeProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: removeProposal.submission_time,
        snapshot: removeProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: removeApp,
      accountId: 'voter2.onsocial.testnet',
      daoPolicy: currentPolicy,
    });
    expect(view.votingProgress.totalWeight).toBe(3);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.eligibleVoters).toEqual([
      'greenghost.onsocial.testnet',
      'voter2.onsocial.testnet',
      'test05.onsocial.testnet',
    ]);
    expect(view.eligibleVoters).not.toContain('berrysamba.testnet');
  });

  it('shows vote-time 2/2 when legacy token vote_counts only include the all role', () => {
    const upgradeProposal: ProtocolDaoProposal = {
      id: 14,
      proposer: 'greenghost.onsocial.testnet',
      description:
        'Upgrade rewards contract by published code hash (250 TGas, cleaned artifact)',
      kind: {
        FunctionCall: {
          receiver_id: 'rewards.onsocial.testnet',
          actions: [],
        },
      },
      status: 'Approved',
      vote_counts: {
        all: ['2000000000000000000000', '0', '0'],
      },
      votes: {
        'greenghost.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
      submission_time: '1773328609709106241',
    };
    const currentPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [50, 100],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'greenghost.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const upgradeApp: ProtocolApplication = {
      app_id: 'protocol-proposal-14',
      label: 'Upgrade',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'upgrade',
      protocol_target_account: 'rewards.onsocial.testnet',
      protocol_target_method: 'update_contract_from_hash',
      governance_proposal: {
        proposal_id: 14,
        status: 'Approved',
        description: upgradeProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: upgradeProposal.submission_time,
        snapshot: upgradeProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: upgradeApp,
      accountId: 'greenghost.onsocial.testnet',
      daoPolicy: currentPolicy,
    });
    expect(view.approveVotes).toBe(2);
    expect(view.rejectVotes).toBe(0);
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
    expect(view.eligibleVoters).toEqual([
      'greenghost.onsocial.testnet',
      'voter2.onsocial.testnet',
    ]);
  });

  it('shows vote-time 2/2 when feed policy_snapshot uses legacy council role', () => {
    const upgradeProposal: ProtocolDaoProposal = {
      id: 14,
      proposer: 'greenghost.onsocial.testnet',
      description:
        'Upgrade rewards contract by published code hash (250 TGas, cleaned artifact)',
      kind: {
        FunctionCall: {
          receiver_id: 'rewards.onsocial.testnet',
          actions: [],
        },
      },
      status: 'Approved',
      vote_counts: {
        all: ['2000000000000000000000', '0', '0'],
      },
      votes: {
        'greenghost.onsocial.testnet': 'Approve',
        'voter2.onsocial.testnet': 'Approve',
      },
      submission_time: '1773328609709106241',
      policy_snapshot: {
        roles: [
          {
            name: 'council',
            kind: {
              Group: [
                'greenghost.onsocial.testnet',
                'voter2.onsocial.testnet',
              ],
            },
          },
        ],
      },
    };
    const currentPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [50, 100],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'greenghost.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const upgradeApp: ProtocolApplication = {
      app_id: 'protocol-proposal-14',
      label: 'Upgrade',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'upgrade',
      governance_proposal: {
        proposal_id: 14,
        status: 'Approved',
        description: upgradeProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: upgradeProposal.submission_time,
        snapshot: upgradeProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: upgradeApp,
      accountId: 'greenghost.onsocial.testnet',
      daoPolicy: currentPolicy,
    });
    expect(view.approveVotes).toBe(2);
    expect(view.votingProgress.totalWeight).toBe(2);
    expect(view.votingProgress.threshold).toBe(2);
  });

  it('shows vote-time 1/1 on founding proposals when only one guardian existed', () => {
    const foundingProposal: ProtocolDaoProposal = {
      id: 0,
      proposer: 'greenghost.onsocial.testnet',
      description: 'Set governance staking contract',
      kind: {
        SetStakingContract: {
          staking_id: 'staking-governance.onsocial.testnet',
        },
      },
      status: 'Approved',
      vote_counts: { council: ['1', '0', '0'] },
      votes: {
        'greenghost.onsocial.testnet': 'Approve',
      },
      submission_time: '1773316571093161525',
    };
    const currentPolicy: ProtocolDaoPolicy = {
      default_vote_policy: {
        quorum: '0',
        threshold: [50, 100],
        weight_kind: 'RoleWeight',
      },
      roles: [
        {
          name: 'guardians',
          kind: {
            Group: [
              'greenghost.onsocial.testnet',
              'voter2.onsocial.testnet',
              'berrysamba.testnet',
            ],
          },
          permissions: ['*:VoteApprove', '*:VoteReject', '*:Finalize'],
        },
      ],
    };
    const foundingApp: ProtocolApplication = {
      app_id: 'protocol-proposal-0',
      label: 'Staking',
      status: 'approved',
      description: null,
      created_at: '1',
      protocol_kind: 'staking',
      governance_proposal: {
        proposal_id: 0,
        status: 'Approved',
        description: foundingProposal.description,
        dao_account: GOVERNANCE_DAO_ACCOUNT,
        tx_hash: null,
        submitted_at: foundingProposal.submission_time,
        snapshot: foundingProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: foundingApp,
      accountId: 'greenghost.onsocial.testnet',
      daoPolicy: currentPolicy,
    });
    expect(view.approveVotes).toBe(1);
    expect(view.votingProgress.totalWeight).toBe(1);
    expect(view.votingProgress.threshold).toBe(1);
    expect(view.eligibleVoters).toEqual(['greenghost.onsocial.testnet']);
  });

  it('shows votes-in state when threshold is met during review', () => {
    const passedProposal: ProtocolDaoProposal = {
      ...proposal,
      vote_counts: { council: ['2', '0', '0'] },
      votes: {
        'alice.testnet': 'Approve',
        'bob.testnet': 'Approve',
      },
    };
    const passedApp: ProtocolApplication = {
      ...application,
      governance_proposal: {
        ...application.governance_proposal!,
        snapshot: passedProposal,
      },
    };
    const view = deriveProtocolProposalView({
      application: passedApp,
      accountId: 'alice.testnet',
      daoPolicy: policy,
    });
    expect(view.statusLabel).toBe('Votes in');
    expect(view.statusTone).toBe('approved');
    expect(view.canFinalize).toBe(true);
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
