import { describe, expect, it } from 'vitest';
import {
  buildDaoPolicyActionPayload,
  buildDaoPolicyDefaultVotePolicyUpdatePayload,
  buildDaoQuorumPresetOptions,
  buildDaoRolePermissionChips,
  buildDaoFundSeasonPoolFromDaoWalletPayload,
  buildDaoFundSeasonPoolFromTreasuryPayload,
  buildDaoTransferOwnershipProposalPayload,
  buildDaoTransferProposalPayload,
  buildDaoWithdrawSocialTreasuryPayload,
  computeRoleWeightApprovalFloor,
  DAO_FULL_PUBLIC_PERMISSIONS_PRESET,
  DAO_PROPOSE_ALL_PERMISSIONS_PRESET,
  defaultVotePolicyThresholdsEqual,
  formatDefaultVotePolicyLabel,
  formatDefaultVoteQuorumLabel,
  formatDaoPermissionPresetLabel,
  formatVoteQuorumOptionLabel,
  isDaoCouncilRole,
  isEditableDaoPolicyRole,
  isVoteQuorumAllowed,
  matchDaoPermissionPreset,
  readPermissionPickerPermissions,
  resolveDaoRoleKind,
  rolePermissionsChanged,
  resolveSelectableVoteQuorum,
  resolveVoteQuorumRisk,
  resolveVoteThresholdPresetId,
  sortDaoPolicyRolesForDisplay,
  votePolicyRulesChanged,
  votePolicyThresholdsEqual,
} from '@/features/governance/governance-proposal-builders';
import type { GovernanceDaoPolicy } from '@/features/governance/types';

describe('governance policy vote threshold builders', () => {
  it('reads and formats default vote policy thresholds', () => {
    expect(formatDefaultVotePolicyLabel([1, 2])).toBe(
      'Simple majority · 50% · 1/2'
    );
    expect(formatDefaultVotePolicyLabel([50, 100])).toBe(
      'Simple majority · 50% · 50/100'
    );
    expect(formatDefaultVotePolicyLabel([75, 100])).toBe(
      'Supermajority · 75% · 75/100'
    );
    expect(resolveVoteThresholdPresetId([1, 2])).toBe('pct_50');
  });

  it('builds ChangePolicyUpdateDefaultVotePolicy payload with quorum', () => {
    const payload = buildDaoPolicyDefaultVotePolicyUpdatePayload({
      threshold: [50, 100],
      quorum: '2',
    });

    expect(payload.proposal.kind).toEqual({
      ChangePolicyUpdateDefaultVotePolicy: {
        vote_policy: {
          weight_kind: 'RoleWeight',
          quorum: '2',
          threshold: [50, 100],
        },
      },
    });
    expect(payload.proposal.description).toContain('quorum Custom · 2');
  });

  it('allows threshold normalization and quorum-only updates', () => {
    const policy: GovernanceDaoPolicy = {
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.testnet'] },
          permissions: ['*:*'],
        },
      ],
      default_vote_policy: {
        weight_kind: 'RoleWeight',
        quorum: '0',
        threshold: [1, 2],
      },
      proposal_bond: '0',
      proposal_period: '0',
    };

    expect(
      buildDaoPolicyActionPayload({
        actionId: 'update_vote_policy',
        policy,
        votePolicyThreshold: [50, 100],
        votePolicyQuorum: '0',
      }).proposal.kind
    ).toHaveProperty('ChangePolicyUpdateDefaultVotePolicy');

    expect(
      buildDaoPolicyActionPayload({
        actionId: 'update_vote_policy',
        policy: {
          ...policy,
          roles: [
            {
              name: 'council',
              kind: { Group: ['alice.testnet', 'bob.testnet'] },
              permissions: ['*:*'],
            },
          ],
          default_vote_policy: {
            weight_kind: 'RoleWeight',
            quorum: '0',
            threshold: [50, 100],
          },
        },
        votePolicyThreshold: [50, 100],
        votePolicyQuorum: '2',
      }).proposal.kind
    ).toHaveProperty('ChangePolicyUpdateDefaultVotePolicy');

    expect(() =>
      buildDaoPolicyActionPayload({
        actionId: 'update_vote_policy',
        policy,
        votePolicyThreshold: [1, 2],
        votePolicyQuorum: '0',
      })
    ).toThrow(/Change vote rules/);

    expect(() =>
      buildDaoPolicyActionPayload({
        actionId: 'update_vote_policy',
        policy,
        votePolicyThreshold: [50, 100],
        votePolicyQuorum: '2',
      })
    ).toThrow(/current council size/);
  });

  it('builds council-aware quorum options', () => {
    expect(computeRoleWeightApprovalFloor([50, 100], 5)).toBe(3);

    expect(
      buildDaoQuorumPresetOptions(1, [50, 100]).map((option) => option.quorum)
    ).toEqual(['0', '1']);
    expect(
      buildDaoQuorumPresetOptions(2, [50, 100]).map((option) => option.quorum)
    ).toEqual(['0', '2']);
    expect(
      buildDaoQuorumPresetOptions(5, [50, 100]).map((option) => option.quorum)
    ).toEqual(['0', '3', '4', '5']);
    expect(
      formatVoteQuorumOptionLabel(buildDaoQuorumPresetOptions(5, [50, 100])[3]!)
    ).toBe('All council · 5');
    expect(isVoteQuorumAllowed('2', 1)).toBe(false);
    expect(isVoteQuorumAllowed('1', 1)).toBe(true);
    expect(resolveSelectableVoteQuorum('2', 1, [50, 100])).toBe('2');
    expect(formatDefaultVoteQuorumLabel('0', 2, [50, 100])).toBe('None · 0');
  });

  it('classifies council vs editable public roles', () => {
    const councilRole = {
      name: 'council',
      kind: { Group: ['alice.near'] },
      permissions: ['*:AddProposal', '*:VoteReject', '*:Finalize'],
    };
    const guardiansRole = {
      name: 'guardians',
      kind: { Group: ['bob.near'] },
      permissions: ['*:*'],
    };
    const everyoneRole = {
      name: 'all',
      permissions: ['*:AddProposal'],
    };

    expect(isDaoCouncilRole(councilRole)).toBe(true);
    expect(isEditableDaoPolicyRole(councilRole)).toBe(false);
    expect(resolveDaoRoleKind(councilRole)).toBe('council');
    expect(
      buildDaoRolePermissionChips(councilRole).map((chip) => chip.label)
    ).toEqual(['Full access']);
    expect(isDaoCouncilRole(guardiansRole)).toBe(true);
    expect(
      sortDaoPolicyRolesForDisplay([
        everyoneRole,
        councilRole,
        {
          name: 'delegated_proposers',
          kind: { Member: '1000' },
          permissions: ['call:AddProposal'],
        },
        guardiansRole,
      ]).map((role) => role.name)
    ).toEqual(['council', 'guardians', 'delegated_proposers', 'all']);

    expect(isDaoCouncilRole(everyoneRole)).toBe(false);
    expect(isEditableDaoPolicyRole(everyoneRole)).toBe(true);
    expect(resolveDaoRoleKind(everyoneRole)).toBe('public');
    expect(
      buildDaoRolePermissionChips(everyoneRole).map((chip) => chip.label)
    ).toEqual(['Propose all']);
    expect(buildDaoRolePermissionChips(everyoneRole)[0]?.tone).toBe('default');
  });

  it('maps wildcard AddProposal to permission picker state', () => {
    expect(DAO_PROPOSE_ALL_PERMISSIONS_PRESET).toHaveLength(7);
    expect(DAO_PROPOSE_ALL_PERMISSIONS_PRESET).toContain(
      'transfer:AddProposal'
    );
    expect(readPermissionPickerPermissions(['*:AddProposal'])).toEqual([
      ...DAO_PROPOSE_ALL_PERMISSIONS_PRESET,
    ]);
    expect(matchDaoPermissionPreset(['*:AddProposal'])).toBe('propose_all');
    expect(formatDaoPermissionPresetLabel('propose_all')).toBe('Propose all');
    expect(
      rolePermissionsChanged({ name: 'all', permissions: ['*:AddProposal'] }, [
        ...DAO_PROPOSE_ALL_PERMISSIONS_PRESET,
      ])
    ).toBe(false);
  });

  it('flags risky quorum choices', () => {
    expect(resolveVoteQuorumRisk('0', 5)).toEqual({
      level: 'none',
      message: null,
    });
    expect(resolveVoteQuorumRisk('5', 5).level).toBe('high');
    expect(resolveVoteQuorumRisk('5', 5).message).toContain(
      'before a council member leaves'
    );
    expect(resolveVoteQuorumRisk('4', 5).level).toBe('caution');
    expect(resolveVoteQuorumRisk('1', 1).level).toBe('caution');
    expect(resolveVoteQuorumRisk('3', 2).level).toBe('high');
  });

  it('detects vote rule changes independently', () => {
    expect(
      votePolicyRulesChanged({
        currentThreshold: [50, 100],
        nextThreshold: [50, 100],
        currentQuorum: '0',
        nextQuorum: '2',
      })
    ).toBe(true);
    expect(votePolicyThresholdsEqual([1, 2], [50, 100])).toBe(true);
    expect(defaultVotePolicyThresholdsEqual([1, 2], [50, 100])).toBe(false);
  });

  it('updates member proposer threshold via policy payload', () => {
    const policy: GovernanceDaoPolicy = {
      roles: [
        {
          name: 'delegated_proposers',
          kind: { Member: '100000000000000000000' },
          permissions: ['call:AddProposal', 'vote:AddProposal'],
          vote_policy: {},
        },
      ],
    };

    const payload = buildDaoPolicyActionPayload({
      actionId: 'update_permissions',
      policy,
      permissionsRoleId: 'delegated_proposers',
      permissions: ['call:AddProposal', 'vote:AddProposal'],
      memberThresholdSmallest: '200000000000000000000',
    });

    expect(payload.proposal.kind).toEqual({
      ChangePolicyAddOrUpdateRole: {
        role: {
          name: 'delegated_proposers',
          kind: { Member: '200000000000000000000' },
          permissions: ['call:AddProposal', 'vote:AddProposal'],
          vote_policy: {},
        },
      },
    });
  });

  it('rejects proposer threshold outside 1–10,000 SOCIAL', () => {
    const policy: GovernanceDaoPolicy = {
      roles: [
        {
          name: 'delegated_proposers',
          kind: { Member: '100000000000000000000' },
          permissions: ['call:AddProposal'],
          vote_policy: {},
        },
      ],
    };

    expect(() =>
      buildDaoPolicyActionPayload({
        actionId: 'update_permissions',
        policy,
        permissionsRoleId: 'delegated_proposers',
        permissions: ['call:AddProposal'],
        memberThresholdSmallest: '10001000000000000000000000',
      })
    ).toThrow('Proposer threshold must be between 1 and 10,000 SOCIAL.');
  });

  it('builds Transfer proposal payload', () => {
    const payload = buildDaoTransferProposalPayload({
      receiverId: 'alice.near',
      amountYocto: '1000000000000000000000000',
      description: 'Pay contractor',
    });

    expect(payload.proposal.description).toBe('Pay contractor');
    expect(payload.proposal.kind).toEqual({
      Transfer: {
        token_id: '',
        receiver_id: 'alice.near',
        amount: '1000000000000000000000000',
      },
    });

    const ftPayload = buildDaoTransferProposalPayload({
      receiverId: 'bob.near',
      amountYocto: '500000000000000000000',
      tokenId: 'token.onsocial.testnet',
      tokenSymbol: 'SOCIAL',
    });

    expect(ftPayload.proposal.description).toBe(
      'Transfer SOCIAL from the DAO to bob.near.'
    );
    expect(ftPayload.proposal.kind).toEqual({
      Transfer: {
        token_id: 'token.onsocial.testnet',
        receiver_id: 'bob.near',
        amount: '500000000000000000000',
      },
    });
  });

  it('builds transfer ownership FunctionCall payload', () => {
    const payload = buildDaoTransferOwnershipProposalPayload({
      contractId: 'rewards.onsocial.testnet',
      contractLabel: 'Rewards',
      newOwnerId: 'alice.testnet',
      transferMethod: 'transfer_ownership',
      transferArgField: 'new_owner',
      gas: 300_000_000_000_000,
      deposit: '0',
    });

    expect(payload.proposal.description).toBe(
      'Transfer Rewards ownership to alice.testnet.'
    );

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          receiver_id: string;
          actions: Array<{
            method_name: string;
            args: string;
            deposit: string;
            gas: number;
          }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.receiver_id).toBe('rewards.onsocial.testnet');
    expect(functionCall.actions[0]).toMatchObject({
      method_name: 'transfer_ownership',
      deposit: '0',
      gas: 300_000_000_000_000,
    });
    expect(JSON.parse(atob(functionCall.actions[0].args))).toEqual({
      new_owner: 'alice.testnet',
    });
  });

  it('builds withdraw social treasury FunctionCall payload', () => {
    const payload = buildDaoWithdrawSocialTreasuryPayload({
      contractId: 'social-spend.onsocial.testnet',
      amountYocto: '500000000000000000000',
      description: 'Sweep rally fees',
    });

    expect(payload.proposal.description).toBe('Sweep rally fees');

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          receiver_id: string;
          actions: Array<{
            method_name: string;
            args: string;
            deposit: string;
            gas: number;
          }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(functionCall.actions[0]?.method_name).toBe('withdraw_treasury');
    expect(JSON.parse(atob(functionCall.actions[0]?.args ?? ''))).toEqual({
      amount: '500000000000000000000',
    });
  });

  it('builds fund season pool FunctionCall payload', () => {
    const payload = buildDaoFundSeasonPoolFromTreasuryPayload({
      contractId: 'social-spend.onsocial.testnet',
      seasonId: 'season-one',
      amountYocto: '1000000000000000000000',
    });

    expect(payload.proposal.description).toContain('season-one');

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          actions: Array<{ method_name: string; args: string }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.actions[0]?.method_name).toBe(
      'fund_season_pool_from_treasury'
    );
    expect(JSON.parse(atob(functionCall.actions[0]?.args ?? ''))).toEqual({
      season_id: 'season-one',
      amount: '1000000000000000000000',
    });
  });

  it('builds fund season pool from DAO wallet via ft_transfer_call', () => {
    const payload = buildDaoFundSeasonPoolFromDaoWalletPayload({
      socialSpendContractId: 'social-spend.onsocial.testnet',
      seasonId: 'season-one',
      amountYocto: '500000000000000000000',
    });

    expect(payload.proposal.description).toContain('DAO treasury');

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          receiver_id: string;
          actions: Array<{ method_name: string; args: string }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.receiver_id).toBe('token.onsocial.testnet');
    expect(functionCall.actions[0]?.method_name).toBe('ft_transfer_call');
    expect(JSON.parse(atob(functionCall.actions[0]?.args ?? ''))).toEqual({
      receiver_id: 'social-spend.onsocial.testnet',
      amount: '500000000000000000000',
      msg: JSON.stringify({
        v: 1,
        action: 'fund_season_pool',
        season_id: 'season-one',
      }),
    });
  });
});
