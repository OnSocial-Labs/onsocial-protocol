import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_CREATE_KIND_COMMON,
  PROTOCOL_CREATE_KIND_OPTIONS,
  isProtocolCreateKind,
} from '@/features/protocol/protocol-create';
import {
  countProtocolApplicationsByStatus,
  filterProtocolApplications,
  findProtocolApplicationByProposalId,
} from '@/features/protocol/protocol-feed-filters';
import {
  PROTOCOL_POLICY_ACTION_COMMON,
  PROTOCOL_POLICY_ACTION_OPTIONS,
} from '@/features/protocol/protocol-policy';
import {
  getProtocolCreateKindLockReason,
  getProtocolPolicyActionLockReason,
} from '@/features/protocol/protocol-propose-gate';
import { deriveProtocolProposalPresentation } from '@/features/protocol/protocol-proposal-presentation';
import type { ProtocolApplication } from '@/features/protocol/types';
import {
  parseProtocolFeedStatus,
  parseProtocolProposalId,
} from '@/lib/app-routes';

function app(partial: {
  proposalId: number;
  status: string;
  label?: string;
}): ProtocolApplication {
  return {
    app_id: `protocol-proposal-${partial.proposalId}`,
    label: partial.label ?? `Proposal ${partial.proposalId}`,
    status: 'approved',
    description: null,
    created_at: '1',
    protocol_kind: null,
    protocol_subject: null,
    protocol_target_account: null,
    protocol_target_method: null,
    governance_proposal: {
      proposal_id: partial.proposalId,
      status: partial.status,
      description: null,
      dao_account: 'dao.near',
      tx_hash: null,
      submitted_at: null,
      snapshot: {
        id: partial.proposalId,
        proposer: 'alice.near',
        description: 'desc',
        kind: { Vote: {} },
        status: partial.status as 'InProgress',
        vote_counts: {},
        votes: {},
        submission_time: '1',
      },
    },
  };
}

describe('protocol feed filters', () => {
  const rows = [
    app({ proposalId: 1, status: 'InProgress' }),
    app({ proposalId: 2, status: 'Approved' }),
    app({ proposalId: 3, status: 'Rejected' }),
    app({ proposalId: 4, status: 'Expired' }),
  ];

  it('parses status and proposal query params', () => {
    expect(parseProtocolFeedStatus('approved')).toBe('approved');
    expect(parseProtocolFeedStatus('InProgress')).toBe('open');
    expect(parseProtocolFeedStatus(null)).toBe('open');
    expect(parseProtocolProposalId('12')).toBe(12);
    expect(parseProtocolProposalId('nope')).toBeNull();
  });

  it('filters and counts by status', () => {
    expect(filterProtocolApplications(rows, 'open')).toHaveLength(1);
    expect(filterProtocolApplications(rows, 'approved')[0]?.app_id).toBe(
      'protocol-proposal-2'
    );
    expect(countProtocolApplicationsByStatus(rows)).toMatchObject({
      open: 1,
      approved: 1,
      rejected: 1,
      expired: 1,
      all: 4,
    });
  });

  it('finds applications by proposal id', () => {
    expect(findProtocolApplicationByProposalId(rows, 3)?.app_id).toBe(
      'protocol-proposal-3'
    );
    expect(findProtocolApplicationByProposalId(rows, 99)).toBeNull();
  });
});

describe('protocol proposal presentation', () => {
  it('headlines membership and transfer kinds', () => {
    expect(
      deriveProtocolProposalPresentation({
        kind: {
          AddMemberToRole: { member_id: 'bob.near', role: 'delegated_proposers' },
        },
        description: null,
        proposer: 'alice.near',
      }).headline
    ).toBe('Add to Delegated Proposers');

    const selfJoin = deriveProtocolProposalPresentation({
      kind: {
        AddMemberToRole: { member_id: 'alice.near', role: 'council' },
      },
      description: null,
      proposer: 'alice.near',
    });
    expect(selfJoin.showProposerAsSelf).toBe(true);
    expect(selfJoin.showProposerSeparately).toBe(false);

    expect(
      deriveProtocolProposalPresentation({
        kind: {
          Transfer: {
            receiver_id: 'treasury.near',
            amount: '1000000000000000000000000',
            token_id: '',
          },
        },
        description: null,
        proposer: 'alice.near',
      }).headline
    ).toContain('Send');
  });

  it('uses signal description for Vote proposals', () => {
    const presentation = deriveProtocolProposalPresentation({
      kind: { Vote: {} },
      description: 'Ship season two\nmore detail',
      proposer: 'alice.near',
    });
    expect(
      deriveProtocolProposalPresentation({
        kind: {
          FunctionCall: {
            receiver_id: 'social-spend.onsocial.testnet',
            actions: [
              {
                method_name: 'set_action_config',
                args: Buffer.from(
                  JSON.stringify({
                    action_id: 'support_profile',
                    config: {
                      treasury_bps: 100,
                      season_pool_bps: 0,
                      target_bps: 9900,
                      burn_bps: 0,
                    },
                  })
                ).toString('base64'),
              },
            ],
          },
        },
        description: null,
        proposer: 'alice.near',
      })
    ).toMatchObject({
      actionBadge: 'Config',
      targetKind: 'routing',
    });
  });
});

describe('protocol propose kind UX helpers', () => {
  it('pins common kinds first and buries power contracts', () => {
    expect(PROTOCOL_CREATE_KIND_COMMON).toEqual([
      'signal',
      'join_self',
      'transfer',
    ]);
    const contractIds = PROTOCOL_CREATE_KIND_OPTIONS.filter(
      (option) => option.group === 'contracts'
    ).map((option) => option.id);
    expect(contractIds.slice(-3)).toEqual([
      'transfer_ownership',
      'contract_upgrade',
      'contract_config',
    ]);
  });

  it('explains locked kinds with short stake/role copy', () => {
    expect(
      getProtocolCreateKindLockReason({
        kind: 'signal',
        accountId: null,
        canProposeAny: false,
        isGroupMember: false,
        remainingLabel: null,
        canProposeKind: false,
      })
    ).toBe('Connect a wallet');
    expect(
      getProtocolCreateKindLockReason({
        kind: 'transfer',
        accountId: 'bob.near',
        canProposeAny: false,
        isGroupMember: false,
        remainingLabel: '12.5K',
        canProposeKind: false,
      })
    ).toBe('Need 12.5K SOCIAL');
    expect(
      getProtocolCreateKindLockReason({
        kind: 'contract_upgrade',
        accountId: 'bob.near',
        canProposeAny: true,
        isGroupMember: false,
        remainingLabel: null,
        canProposeKind: false,
      })
    ).toBe('Needs call permission.');
    expect(
      getProtocolCreateKindLockReason({
        kind: 'signal',
        accountId: 'bob.near',
        canProposeAny: true,
        isGroupMember: false,
        remainingLabel: null,
        canProposeKind: true,
      })
    ).toBeNull();
  });

  it('validates remembered create kinds', () => {
    expect(isProtocolCreateKind('signal')).toBe(true);
    expect(isProtocolCreateKind('not-a-kind')).toBe(false);
  });
});

describe('protocol settings action UX helpers', () => {
  it('pins vote policy and permissions as common', () => {
    expect(PROTOCOL_POLICY_ACTION_COMMON).toEqual([
      'update_vote_policy',
      'update_permissions',
    ]);
    expect(PROTOCOL_POLICY_ACTION_OPTIONS.map((option) => option.id)).toEqual([
      'update_vote_policy',
      'update_permissions',
      'update_parameters',
      'update_config',
      'add_role',
      'remove_role',
    ]);
  });

  it('explains locked settings actions with short copy', () => {
    expect(
      getProtocolPolicyActionLockReason({
        actionId: 'update_vote_policy',
        accountId: 'bob.near',
        canProposeAny: false,
        isGroupMember: false,
        remainingLabel: '1K',
        canProposeAction: false,
      })
    ).toBe('Need 1K SOCIAL');
    expect(
      getProtocolPolicyActionLockReason({
        actionId: 'remove_role',
        accountId: 'bob.near',
        canProposeAny: true,
        isGroupMember: false,
        remainingLabel: null,
        canProposeAction: false,
      })
    ).toBe('Needs remove-role permission.');
  });
});
