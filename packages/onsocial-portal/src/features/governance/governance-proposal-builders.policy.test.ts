import { describe, expect, it } from 'vitest';
import {
  buildDaoPolicyActionPayload,
  buildDaoConfigChangePayload,
  buildDaoPolicyDefaultVotePolicyUpdatePayload,
  buildDaoQuorumPresetOptions,
  buildDaoRolePermissionChips,
  buildDaoFundSeasonPoolPayload,
  buildDaoContractUpgradeProposalPayload,
  buildDaoContractConfigProposalPayload,
  buildDaoTransferOwnershipProposalPayload,
  formatPublishedCodeHashPreview,
  buildDaoTransferProposalPayload,
  buildDaoWithdrawBoostInfraPayload,
  buildDaoSetBoostInfraAuthorityPayload,
  canProposePolicyAction,
  computeRoleWeightApprovalFloor,
  DAO_FULL_PUBLIC_PERMISSIONS_PRESET,
  DAO_PROPOSE_ALL_PERMISSIONS_PRESET,
  daoConfigFieldsChanged,
  defaultVotePolicyThresholdsEqual,
  formatDefaultVotePolicyLabel,
  formatDefaultVoteQuorumLabel,
  formatDaoPermissionPresetLabel,
  formatVoteQuorumOptionLabel,
  getDaoPolicyActionHint,
  getDaoGroupMembershipRoleNames,
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
  resolveAvailableProposalActionsForCreate,
  resolveActiveCreatableProposalAction,
  resolveGovernanceCreateProposalPreviewActions,
  pickDefaultCreatableProposalAction,
  buildGovernanceCreateActionMenuItems,
  groupGovernanceCreateActionMenuItems,
  resolveGovernanceCreateActionMenuCategoryId,
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

  it('builds ChangeConfig payload for DAO name and purpose', () => {
    const payload = buildDaoConfigChangePayload({
      name: 'OnSocial Governance',
      purpose:
        'Protect user-owned identity, voluntary solidarity, and scarce infrastructure.',
      description: 'Set governance DAO purpose to the constitution mandate.',
    });

    expect(payload.proposal.kind).toEqual({
      ChangeConfig: {
        config: {
          name: 'OnSocial Governance',
          purpose:
            'Protect user-owned identity, voluntary solidarity, and scarce infrastructure.',
          metadata: '',
        },
      },
    });
    expect(payload.proposal.description).toBe(
      'Set governance DAO purpose to the constitution mandate.'
    );
  });

  it('builds update_config through buildDaoPolicyActionPayload', () => {
    const payload = buildDaoPolicyActionPayload({
      actionId: 'update_config',
      policy: null,
      daoConfigName: 'OnSocial Governance',
      daoConfigPurpose: 'Updated purpose.',
      daoConfigMetadata: '',
    });

    expect(payload.proposal.kind).toEqual({
      ChangeConfig: {
        config: {
          name: 'OnSocial Governance',
          purpose: 'Updated purpose.',
          metadata: '',
        },
      },
    });
  });

  it('detects DAO config field changes', () => {
    expect(
      daoConfigFieldsChanged(
        { name: 'OnSocial Governance', purpose: 'Old purpose.' },
        { name: 'OnSocial Governance', purpose: 'New purpose.' }
      )
    ).toBe(true);

    expect(
      daoConfigFieldsChanged(
        { name: 'OnSocial Governance', purpose: 'Same purpose.' },
        { name: 'OnSocial Governance', purpose: 'Same purpose.' }
      )
    ).toBe(false);
  });

  it('allows guardians to propose config changes', () => {
    const policy: GovernanceDaoPolicy = {
      roles: [
        {
          name: 'guardians',
          kind: { Group: ['alice.testnet'] },
          permissions: ['*:*'],
        },
      ],
    };

    expect(
      canProposePolicyAction(policy, 'alice.testnet', '0', 'update_config')
    ).toBe(true);
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

  it('builds contract upgrade FunctionCall payload', () => {
    const codeHash = '1111111111111111111111111111111111111111111';
    const payload = buildDaoContractUpgradeProposalPayload({
      contractId: 'social-spend.onsocial.testnet',
      contractLabel: 'Social spend',
      codeHash,
    });

    expect(payload.proposal.description).toBe(
      'Upgrade Social spend by published code hash (250 TGas).'
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

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(functionCall.actions[0]).toMatchObject({
      method_name: 'update_contract_from_hash',
      deposit: '0',
      gas: 250_000_000_000_000,
    });
    expect(JSON.parse(atob(functionCall.actions[0].args))).toEqual({
      code_hash: codeHash,
    });
  });

  it('rejects contract upgrade for non-hash-upgradable contracts', () => {
    expect(() =>
      buildDaoContractUpgradeProposalPayload({
        contractId: 'token.onsocial.testnet',
        codeHash: '1111111111111111111111111111111111111111111',
      })
    ).toThrow('This contract does not support hash-based upgrades.');
  });

  it('builds join rally routing contract config FunctionCall payload', () => {
    const payload = buildDaoContractConfigProposalPayload({
      operationId: 'social_spend_join_rally_routing',
      contractLabel: 'Social spend',
      routing: {
        label: 'Join Rally',
        active: true,
        min_amount: '100000000000000000000',
        target_types: ['rally'],
        treasury_bps: 0,
        season_pool_bps: 9500,
        target_bps: 0,
        burn_bps: 500,
        season_required: true,
        allow_self_target: true,
      },
    });

    expect(payload.proposal.description).toBe(
      'Configure Social spend join rally routing (95% pool · 5% burn).'
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

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(functionCall.actions[0]).toMatchObject({
      method_name: 'set_action_config',
      deposit: '1',
      gas: 100_000_000_000_000,
    });
    expect(JSON.parse(atob(functionCall.actions[0].args))).toEqual({
      action_id: 'join_rally',
      config: {
        label: 'Join Rally',
        active: true,
        min_amount: '100000000000000000000',
        target_types: ['rally'],
        treasury_bps: 0,
        season_pool_bps: 9500,
        target_bps: 0,
        burn_bps: 500,
        season_required: true,
        allow_self_target: true,
      },
    });
  });

  it('builds support profile routing contract config FunctionCall payload', () => {
    const payload = buildDaoContractConfigProposalPayload({
      operationId: 'social_spend_support_profile_routing',
      contractLabel: 'Social spend',
      routing: {
        label: 'Support Profile',
        active: true,
        min_amount: '10000000000000000',
        target_types: ['profile'],
        treasury_bps: 100,
        season_pool_bps: 0,
        target_bps: 9900,
        burn_bps: 0,
        season_required: false,
        allow_self_target: false,
      },
    });

    expect(payload.proposal.description).toBe(
      'Configure Social spend support profile routing (1% boost credits · 99% target).'
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

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(JSON.parse(atob(functionCall.actions[0].args))).toEqual({
      action_id: 'support_profile',
      config: {
        label: 'Support Profile',
        active: true,
        min_amount: '10000000000000000',
        target_types: ['profile'],
        treasury_bps: 100,
        season_pool_bps: 0,
        target_bps: 9900,
        burn_bps: 0,
        season_required: false,
        allow_self_target: false,
      },
    });
  });

  it('builds support endorsement routing contract config FunctionCall payload', () => {
    const payload = buildDaoContractConfigProposalPayload({
      operationId: 'social_spend_support_endorsement_routing',
      contractLabel: 'Social spend',
      routing: {
        label: 'Support Endorsement',
        active: true,
        min_amount: '10000000000000000',
        target_types: ['endorsement'],
        treasury_bps: 500,
        season_pool_bps: 0,
        target_bps: 9500,
        burn_bps: 0,
        season_required: false,
        allow_self_target: false,
      },
    });

    expect(payload.proposal.description).toBe(
      'Configure Social spend support endorsement routing (5% boost credits · 95% target).'
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

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(JSON.parse(atob(functionCall.actions[0].args))).toEqual({
      action_id: 'support_endorsement',
      config: {
        label: 'Support Endorsement',
        active: true,
        min_amount: '10000000000000000',
        target_types: ['endorsement'],
        treasury_bps: 500,
        season_pool_bps: 0,
        target_bps: 9500,
        burn_bps: 0,
        season_required: false,
        allow_self_target: false,
      },
    });
  });

  it('builds boost post routing contract config FunctionCall payload', () => {
    const payload = buildDaoContractConfigProposalPayload({
      operationId: 'social_spend_boost_post_routing',
      contractLabel: 'Social spend',
      routing: {
        label: 'Boost Post',
        active: true,
        min_amount: '10000000000000000000',
        target_types: ['post'],
        treasury_bps: 1000,
        season_pool_bps: 0,
        target_bps: 9000,
        burn_bps: 0,
        season_required: false,
        allow_self_target: true,
      },
    });

    expect(payload.proposal.description).toBe(
      'Configure Social spend boost post routing (10% boost credits · 90% target).'
    );

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          receiver_id: string;
          actions: Array<{
            method_name: string;
            args: string;
          }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(JSON.parse(atob(functionCall.actions[0].args))).toEqual({
      action_id: 'boost_post',
      config: {
        label: 'Boost Post',
        active: true,
        min_amount: '10000000000000000000',
        target_types: ['post'],
        treasury_bps: 1000,
        season_pool_bps: 0,
        target_bps: 9000,
        burn_bps: 0,
        season_required: false,
        allow_self_target: true,
      },
    });
  });

  it('builds rally season window contract config FunctionCall payload', () => {
    const startsMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const startsAtLocal = new Date(startsMs);
    const pad = (value: number) => String(value).padStart(2, '0');
    const starts_at_local = `${startsAtLocal.getFullYear()}-${pad(startsAtLocal.getMonth() + 1)}-${pad(startsAtLocal.getDate())}T${pad(startsAtLocal.getHours())}:${pad(startsAtLocal.getMinutes())}`;

    const payload = buildDaoContractConfigProposalPayload({
      operationId: 'social_spend_set_season_config',
      contractLabel: 'Social spend',
      seasonConfig: {
        season_id: 'season-two',
        label: 'OnSocial Rally',
        active: true,
        start_offset_minutes: 7 * 24 * 60,
        starts_at_local,
        duration_minutes: 420,
      },
    });

    expect(payload.proposal.description).toContain('season-two');

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          receiver_id: string;
          actions: Array<{ method_name: string; args: string }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(functionCall.actions[0].method_name).toBe('set_season_config');
    expect(JSON.parse(atob(functionCall.actions[0].args))).toMatchObject({
      season_id: 'season-two',
      config: {
        label: 'OnSocial Rally',
        active: true,
        claim_starts_at_ns: null,
      },
    });
  });

  it('formats published code hash previews for proposal cards', () => {
    expect(
      formatPublishedCodeHashPreview(
        '85a9kdWatcHHkpmNu3pDyLvZ9wJkmTqhXVLhGsd17y16'
      )
    ).toBe('85a9kdWatc…Gsd17y16');
  });

  it('builds withdraw boost infra FunctionCall payload', () => {
    const payload = buildDaoWithdrawBoostInfraPayload({
      contractId: 'boost.onsocial.testnet',
      amountYocto: '12560000000000000000',
      receiverId: 'treasury.onsocial.testnet',
      description: 'Withdraw boost infra',
    });

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

    expect(functionCall.receiver_id).toBe('boost.onsocial.testnet');
    expect(functionCall.actions[0]?.method_name).toBe('withdraw_infra');
    expect(JSON.parse(atob(functionCall.actions[0]?.args ?? ''))).toEqual({
      amount: '12560000000000000000',
      receiver_id: 'treasury.onsocial.testnet',
    });
  });

  it('builds set boost infra authority FunctionCall payload', () => {
    const payload = buildDaoSetBoostInfraAuthorityPayload({
      contractId: 'boost.onsocial.testnet',
      authorityId: 'treasury.onsocial.testnet',
      description: 'Delegate boost infra withdraw',
    });

    const functionCall = (
      payload.proposal.kind as {
        FunctionCall: {
          receiver_id: string;
          actions: Array<{
            method_name: string;
            args: string;
          }>;
        };
      }
    ).FunctionCall;

    expect(functionCall.actions[0]?.method_name).toBe(
      'set_infra_withdraw_authority'
    );
    expect(JSON.parse(atob(functionCall.actions[0]?.args ?? ''))).toEqual({
      authority: 'treasury.onsocial.testnet',
    });
  });

  it('builds fund season pool from DAO wallet via ft_transfer_call', () => {
    const payload = buildDaoFundSeasonPoolPayload({
      contractId: 'social-spend.onsocial.testnet',
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

describe('DAO group membership helpers', () => {
  it('lists group role names for a member account', () => {
    const policy = {
      roles: [
        {
          name: 'council',
          kind: { Group: ['alice.testnet'] },
          permissions: [],
        },
        {
          name: 'guardians',
          kind: { Group: ['bob.testnet'] },
          permissions: [],
        },
      ],
    } as GovernanceDaoPolicy;

    expect(getDaoGroupMembershipRoleNames(policy, 'alice.testnet')).toEqual([
      'council',
    ]);
  });
});

describe('resolveAvailableProposalActionsForCreate', () => {
  const idleChain = {
    managedContractsLoading: false,
    managedContractsCount: 1,
    hashUpgradableManagedContractsCount: 1,
    configurableManagedContractsCount: 1,
    socialSpendTreasuryLoading: false,
    socialSpendTreasuryContext: {
      canFundSeasonPool: true,
      fundableSeasonIds: ['season-one'],
    },
    boostInfraLoading: false,
    boostInfraContext: {
      canWithdrawBoostInfra: true,
      canSetBoostInfraAuthority: false,
    },
    transferAssetsLoading: false,
    transferAssetsCount: 1,
  } as const;

  it('keeps policy-permitted actions when chain capability is ready', () => {
    expect(
      resolveAvailableProposalActionsForCreate(
        ['transfer', 'fund_season_pool', 'withdraw_boost_infra'],
        idleChain
      )
    ).toEqual(['transfer', 'fund_season_pool', 'withdraw_boost_infra']);
  });

  it('hides fund rally until treasury context confirms a live season', () => {
    expect(
      resolveAvailableProposalActionsForCreate(['fund_season_pool'], {
        ...idleChain,
        socialSpendTreasuryLoading: true,
        socialSpendTreasuryContext: null,
      })
    ).toEqual([]);

    expect(
      resolveAvailableProposalActionsForCreate(['fund_season_pool'], {
        ...idleChain,
        socialSpendTreasuryContext: {
          canFundSeasonPool: true,
          fundableSeasonIds: [],
        },
      })
    ).toEqual([]);
  });

  it('derives boost delegate from chain authority instead of board labels', () => {
    expect(
      resolveAvailableProposalActionsForCreate(['set_boost_infra_authority'], {
        ...idleChain,
        boostInfraContext: {
          canWithdrawBoostInfra: false,
          canSetBoostInfraAuthority: true,
        },
      })
    ).toEqual(['set_boost_infra_authority']);
  });

  it('hides transfer while assets are loading or empty', () => {
    expect(
      resolveAvailableProposalActionsForCreate(['transfer'], {
        ...idleChain,
        transferAssetsLoading: true,
        transferAssetsCount: 0,
      })
    ).toEqual([]);

    expect(
      resolveAvailableProposalActionsForCreate(['transfer'], {
        ...idleChain,
        transferAssetsCount: 0,
      })
    ).toEqual([]);
  });
});

describe('resolveGovernanceCreateProposalPreviewActions', () => {
  it('previews threshold-unlocked actions when delegation is the blocker', () => {
    const policy = {
      roles: [
        {
          name: 'delegated_proposers',
          kind: { Member: '500000000000000000000000' },
          permissions: ['vote:AddProposal', 'transfer:AddProposal'],
        },
      ],
    } as GovernanceDaoPolicy;

    expect(
      resolveGovernanceCreateProposalPreviewActions({
        policy,
        roleId: '',
        proposerAccountId: 'alice.testnet',
        delegatedWeight: '0',
        proposalThresholdWeight: '500000000000000000000000',
        isDaoMember: false,
        baseAvailableProposalActions: [],
        availableProposalActions: [],
      })
    ).toEqual(['idea', 'transfer']);
  });

  it('previews policy-permitted actions when chain capability blocks them', () => {
    expect(
      resolveGovernanceCreateProposalPreviewActions({
        policy: null,
        roleId: '',
        proposerAccountId: 'alice.testnet',
        delegatedWeight: '0',
        proposalThresholdWeight: '0',
        isDaoMember: false,
        baseAvailableProposalActions: ['fund_season_pool'],
        availableProposalActions: [],
      })
    ).toEqual(['fund_season_pool']);
  });
});

describe('getDaoPolicyActionHint', () => {
  it('returns sharp parameter descriptions when values change', () => {
    expect(
      getDaoPolicyActionHint('update_parameters', {
        parametersChanged: true,
        bondChanged: true,
        periodChanged: true,
        bondNearLabel: '0.1',
        periodDaysLabel: '7',
      })
    ).toBe('Set proposal bond 0.1 NEAR · period 7d.');
  });
});

describe('groupGovernanceCreateActionMenuItems', () => {
  it('groups proposal actions by section for category tabs', () => {
    const items = buildGovernanceCreateActionMenuItems({
      availableProposalActions: ['join_self', 'transfer', 'contract_upgrade'],
    });

    expect(groupGovernanceCreateActionMenuItems(items)).toEqual([
      {
        id: 'membership',
        label: 'Membership',
        items: [expect.objectContaining({ kind: 'proposal', id: 'join_self' })],
      },
      {
        id: 'treasury',
        label: 'Treasury',
        items: [expect.objectContaining({ kind: 'proposal', id: 'transfer' })],
      },
      {
        id: 'contracts',
        label: 'Contracts',
        items: [
          expect.objectContaining({ kind: 'proposal', id: 'contract_upgrade' }),
        ],
      },
    ]);
  });

  it('resolves the category for the active proposal action', () => {
    expect(resolveGovernanceCreateActionMenuCategoryId('transfer')).toBe(
      'treasury'
    );
    expect(resolveGovernanceCreateActionMenuCategoryId('join_self')).toBe(
      'membership'
    );
  });
});

describe('resolveActiveCreatableProposalAction', () => {
  it('falls back to signal then first available action', () => {
    expect(
      resolveActiveCreatableProposalAction('join_self', ['transfer', 'idea'])
    ).toBe('idea');
    expect(
      resolveActiveCreatableProposalAction('join_self', ['transfer'])
    ).toBe('transfer');
    expect(pickDefaultCreatableProposalAction([])).toBeNull();
  });
});
