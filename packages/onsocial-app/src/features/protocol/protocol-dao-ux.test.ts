import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_CREATE_KIND_COMMON,
  PROTOCOL_CREATE_KIND_OPTIONS,
  isProtocolCreateKind,
  isProtocolCreateMembershipKind,
  protocolCreateKindHint,
  protocolCreateComposeKindHint,
} from '@/features/protocol/protocol-create';
import {
  countProtocolApplicationsByFamily,
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
  viewerHasCreateKindPermission,
  viewerHasPolicyActionPermission,
} from '@/features/protocol/protocol-propose-gate';
import {
  hasDaoProposalsDeepLink,
  parseProtocolProposalFamily,
  protocolProposalFamilyFromBadge,
} from '@/features/protocol/protocol-proposal-family';
import {
  classifyCoreExecuteSetKeys,
  deriveProtocolProposalPresentation,
  formatProtocolOnChainActionLabel,
} from '@/features/protocol/protocol-proposal-presentation';
import { isProtocolApplicationSoftExpired } from '@/features/protocol/protocol-card-view';
import type { ProtocolApplication } from '@/features/protocol/types';
import {
  daoPortfolioPath,
  parseProtocolFeedStatus,
  parseProtocolProposalId,
} from '@/lib/app-routes';

function app(partial: {
  proposalId: number;
  status: string;
  label?: string;
  kind?: Record<string, unknown>;
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
        kind: (partial.kind ?? { Vote: {} }) as never,
        status: partial.status as 'InProgress',
        vote_counts: {},
        votes: {},
        submission_time: '1',
      },
    },
  };
}

function encodeArgs(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
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
    expect(parseProtocolFeedStatus(null)).toBe('all');
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

  it('routes stale InProgress proposals to expired when past proposal period', () => {
    const periodNs = String(7n * 24n * 60n * 60n * 1_000_000_000n);
    const stale = app({ proposalId: 96, status: 'InProgress' });
    stale.governance_proposal!.snapshot!.submission_time = String(
      BigInt(Date.now() - 500 * 86_400_000) * 1_000_000n
    );
    const policy = { proposal_period: periodNs };
    const isSoftExpired = (application: ProtocolApplication) =>
      isProtocolApplicationSoftExpired(application, policy, Date.now());

    expect(
      filterProtocolApplications([stale], 'open', { isSoftExpired })
    ).toHaveLength(0);
    expect(
      filterProtocolApplications([stale], 'expired', { isSoftExpired })
    ).toHaveLength(1);
    expect(
      countProtocolApplicationsByStatus([stale], { isSoftExpired }).expired
    ).toBe(1);
  });

  it('finds applications by proposal id', () => {
    expect(findProtocolApplicationByProposalId(rows, 3)?.app_id).toBe(
      'protocol-proposal-3'
    );
    expect(findProtocolApplicationByProposalId(rows, 99)).toBeNull();
  });

  it('filters and counts by family lens', () => {
    const familyRows = [
      app({
        proposalId: 10,
        status: 'InProgress',
        kind: {
          AddMemberToRole: { member_id: 'bob.near', role: 'council' },
        },
      }),
      app({
        proposalId: 11,
        status: 'InProgress',
        kind: {
          Transfer: {
            receiver_id: 'treasury.near',
            amount: '1000000000000000000000000',
            token_id: '',
          },
        },
      }),
      app({
        proposalId: 12,
        status: 'Approved',
        kind: {
          FunctionCall: {
            receiver_id: 'core.onsocial.testnet',
            actions: [
              {
                method_name: 'execute',
                args: encodeArgs({
                  request: {
                    action: {
                      type: 'set',
                      data: { 'page/main': '{}' },
                    },
                  },
                }),
              },
            ],
          },
        },
      }),
    ];

    expect(
      filterProtocolApplications(familyRows, 'all', { family: 'membership' })
    ).toHaveLength(1);
    expect(
      filterProtocolApplications(familyRows, 'all', { family: 'treasury' })[0]
        ?.app_id
    ).toBe('protocol-proposal-11');
    expect(
      filterProtocolApplications(familyRows, 'all', { family: 'face' })[0]
        ?.app_id
    ).toBe('protocol-proposal-12');
    expect(countProtocolApplicationsByFamily(familyRows)).toMatchObject({
      membership: 1,
      treasury: 1,
      face: 1,
      all: 3,
    });
  });
});

describe('protocol proposal family', () => {
  it('maps badges and parses URL kind', () => {
    expect(protocolProposalFamilyFromBadge('Mood')).toBe('face');
    expect(protocolProposalFamilyFromBadge('Boost')).toBe('boost');
    expect(protocolProposalFamilyFromBadge('Support')).toBe('support');
    expect(parseProtocolProposalFamily('members')).toBe('membership');
    expect(parseProtocolProposalFamily('face')).toBe('face');
    expect(parseProtocolProposalFamily(null)).toBe('all');
    expect(daoPortfolioPath('guild.sputnik-dao.near', { family: 'boost' })).toBe(
      '/@guild.sputnik-dao.near?kind=boost'
    );
  });

  it('opens Proposals for proposal, status, search, and family kind', () => {
    const params = (raw: string) => new URLSearchParams(raw);
    expect(hasDaoProposalsDeepLink(params(''))).toBe(false);
    expect(hasDaoProposalsDeepLink(params('kind=all'))).toBe(false);
    expect(hasDaoProposalsDeepLink(params('kind=nope'))).toBe(false);
    expect(hasDaoProposalsDeepLink(params('kind=boost'))).toBe(true);
    expect(hasDaoProposalsDeepLink(params('status=open'))).toBe(true);
    expect(hasDaoProposalsDeepLink(params('q=bond'))).toBe(true);
    expect(hasDaoProposalsDeepLink(params('proposal=12'))).toBe(true);
  });

  it('builds a path without sticky proposal when clearing deep links', () => {
    expect(
      daoPortfolioPath('treasury.onsocial.testnet', {
        status: 'approved',
        proposal: null,
        q: 'sweep',
      })
    ).toBe('/@treasury.onsocial.testnet?status=approved&q=sweep');
  });

  it('classifies core execute set keys', () => {
    expect(classifyCoreExecuteSetKeys(['page/main'])).toBe('mood');
    expect(classifyCoreExecuteSetKeys(['post/99'])).toBe('post');
    expect(classifyCoreExecuteSetKeys(['profile/name'])).toBe('profile');
    expect(classifyCoreExecuteSetKeys(['other'])).toBeNull();
  });
});

describe('protocol proposal presentation', () => {
  it('humanizes on-chain policy permission labels', () => {
    expect(
      formatProtocolOnChainActionLabel('add_member_to_role', 'policy')
    ).toBe('Add Member To Role');
    expect(formatProtocolOnChainActionLabel('vote', 'policy')).toBe(
      'Vote signal'
    );
    expect(formatProtocolOnChainActionLabel('update_contract', 'method')).toBe(
      'update_contract'
    );
  });

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
    expect(selfJoin.family).toBe('membership');

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
      })
    ).toMatchObject({ family: 'treasury' });
  });

  it('labels face and support calls with honest badges', () => {
    expect(
      deriveProtocolProposalPresentation({
        kind: {
          FunctionCall: {
            receiver_id: 'core.onsocial.testnet',
            actions: [
              {
                method_name: 'execute',
                args: encodeArgs({
                  request: {
                    action: {
                      type: 'set',
                      data: { 'page/main': '{}' },
                    },
                  },
                }),
              },
            ],
          },
        },
        description: null,
        proposer: 'alice.near',
      })
    ).toMatchObject({
      actionBadge: 'Mood',
      family: 'face',
      headline: 'Update mood',
    });

    expect(
      deriveProtocolProposalPresentation({
        kind: {
          FunctionCall: {
            receiver_id: 'core.onsocial.testnet',
            actions: [
              {
                method_name: 'execute',
                args: encodeArgs({
                  request: {
                    action: {
                      type: 'set',
                      data: { 'post/7': { type: 'text' } },
                    },
                  },
                }),
              },
            ],
          },
        },
        description: null,
        proposer: 'alice.near',
      })
    ).toMatchObject({ actionBadge: 'Post', family: 'face' });

    expect(
      deriveProtocolProposalPresentation({
        kind: {
          FunctionCall: {
            receiver_id: 'social-spend.onsocial.testnet',
            actions: [
              {
                method_name: 'claim_target_balance',
                args: encodeArgs({}),
              },
            ],
          },
        },
        description: null,
        proposer: 'alice.near',
      })
    ).toMatchObject({
      actionBadge: 'Support',
      family: 'support',
      headline: 'Claim support to treasury',
    });

    expect(
      deriveProtocolProposalPresentation({
        kind: {
          FunctionCall: {
            receiver_id: 'boost.onsocial.testnet',
            actions: [
              {
                method_name: 'withdraw_infra',
                args: encodeArgs({
                  amount: '1000000000000000000000',
                  receiver_id: 'treasury.onsocial.testnet',
                }),
              },
            ],
          },
        },
        description: null,
        proposer: 'alice.near',
      })
    ).toMatchObject({
      headline: 'Withdraw 1000 SOCIAL · infra pool → Treasury',
      actionBadge: 'Treasury',
      subjectAccount: 'treasury.onsocial.testnet',
      subjectEyebrow: 'To',
    });
  });

  it('uses signal description for Vote proposals', () => {
    const presentation = deriveProtocolProposalPresentation({
      kind: { Vote: {} },
      description: 'Ship season two\nmore detail',
      proposer: 'alice.near',
    });
    expect(presentation.actionBadge).toBe('Signal');
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
      family: 'config',
    });
  });
});

describe('protocol propose kind UX helpers', () => {
  it('maps kind hints and membership kinds for compose chrome', () => {
    expect(protocolCreateKindHint('transfer')).toBe(
      'Send NEAR or FT from the DAO treasury.'
    );
    expect(protocolCreateComposeKindHint('transfer')).toBe('');
    expect(protocolCreateComposeKindHint('signal')).toBe(
      'Text-only · nothing executes.'
    );
    expect(isProtocolCreateMembershipKind('join_self')).toBe(true);
    expect(isProtocolCreateMembershipKind('signal')).toBe(false);
  });

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
    expect(
      getProtocolCreateKindLockReason({
        kind: 'signal',
        accountId: 'bob.near',
        canProposeAny: false,
        isGroupMember: false,
        remainingLabel: '12.5K',
        canProposeKind: false,
        hasStakeProposePath: false,
      })
    ).toBe('Not on a proposing role');
    expect(
      getProtocolCreateKindLockReason({
        kind: 'signal',
        accountId: 'bob.near',
        canProposeAny: false,
        isGroupMember: false,
        remainingLabel: null,
        canProposeKind: false,
        hasStakeProposePath: false,
        foreignStakeTokenLabel: 'USDC',
      })
    ).toBe('Need USDC stake');
  });

  it('hides create kinds by permission, not by stake weight', () => {
    const policy = {
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.near'] },
          permissions: ['vote:AddProposal', 'transfer:AddProposal'],
          vote_policy: {},
        },
        {
          name: 'token_holders',
          kind: { Member: '1000' },
          permissions: ['call:AddProposal'],
          vote_policy: {},
        },
      ],
      default_vote_policy: {
        weight_kind: 'RoleWeight' as const,
        quorum: '0',
        threshold: [1, 2] as [number, number],
      },
      proposal_bond: '0',
      proposal_period: '0',
      bounty_bond: '0',
      bounty_forgiveness_period: '0',
    };

    expect(viewerHasCreateKindPermission(policy, 'alice.near', 'signal')).toBe(
      true
    );
    expect(
      viewerHasCreateKindPermission(policy, 'alice.near', 'transfer')
    ).toBe(true);
    // Member-threshold Call path is visible to everyone (stake can unlock)
    expect(
      viewerHasCreateKindPermission(policy, 'alice.near', 'contract_upgrade')
    ).toBe(true);
    expect(
      viewerHasCreateKindPermission(policy, 'bob.near', 'contract_upgrade')
    ).toBe(true);
    // Group-only kinds stay hidden for outsiders
    expect(viewerHasCreateKindPermission(policy, 'bob.near', 'signal')).toBe(
      false
    );
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

  it('hides settings actions by permission path', () => {
    const policy = {
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.near'] },
          permissions: ['policy_update_default_vote_policy:AddProposal'],
          vote_policy: {},
        },
      ],
      default_vote_policy: {
        weight_kind: 'RoleWeight' as const,
        quorum: '0',
        threshold: [1, 2] as [number, number],
      },
      proposal_bond: '0',
      proposal_period: '0',
      bounty_bond: '0',
      bounty_forgiveness_period: '0',
    };
    expect(
      viewerHasPolicyActionPermission(policy, 'alice.near', 'update_vote_policy')
    ).toBe(true);
    expect(
      viewerHasPolicyActionPermission(policy, 'alice.near', 'remove_role')
    ).toBe(false);
    expect(
      viewerHasPolicyActionPermission(policy, 'bob.near', 'update_vote_policy')
    ).toBe(false);
  });
});
