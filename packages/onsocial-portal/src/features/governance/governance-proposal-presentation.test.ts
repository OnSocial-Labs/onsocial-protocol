import { describe, expect, it } from 'vitest';
import { SOCIAL_SPEND_MIN_AMOUNT_YOCTO } from '@/lib/dao-contract-config-operations';
import { SOCIAL_SPEND_MIN_AMOUNT_YOCTO } from '@/lib/dao-contract-config-operations';
import {
  deriveProposalPresentation,
  resolveProposalTargetEyebrowLabel,
} from './governance-proposal-presentation';

function encodeArgs(args: Record<string, unknown>): string {
  return btoa(JSON.stringify(args));
}

describe('deriveProposalPresentation', () => {
  it('formats social-spend treasury withdraw with human amount and proposer', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description:
        'Withdraw 10000000000000000000 yocto SOCIAL from social-spend treasury to treasury_id.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'withdraw_treasury',
              args: encodeArgs({ amount: '10000000000000000000' }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.subjectEyebrow).toBe('From');
    expect(presentation.targetValue).toBe('10 SOCIAL');
    expect(presentation.showProposerSeparately).toBe(true);
    expect(presentation.onChainDescription).toContain('yocto SOCIAL');
  });

  it('formats boost infra withdraw like social-spend sweep (From contract + Amount)', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description: 'Withdrawing portion of the tokens for infra.',
      kind: {
        FunctionCall: {
          receiver_id: 'boost.onsocial.testnet',
          actions: [
            {
              method_name: 'withdraw_infra',
              args: encodeArgs({
                amount: '5000000000000000000',
                receiver_id: 'treasury.onsocial.testnet',
              }),
              deposit: '1',
              gas: 150_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.headline).toBe('Withdraw 5 SOCIAL from boost infra');
    expect(presentation.subjectEyebrow).toBe('From');
    expect(presentation.subjectAccount).toBe('boost.onsocial.testnet');
    expect(presentation.targetValue).toBe('5 SOCIAL');
    expect(presentation.actionBadge).toBe('Treasury');
  });

  it('shows transfer recipient with To eyebrow and proposer row', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description: 'I would like to test transfer.',
      kind: {
        Transfer: {
          receiver_id: 'treasury.onsocial.testnet',
          amount: '1000000000000000000000000',
          token_id: '',
        },
      },
    });

    expect(presentation.subjectEyebrow).toBe('To');
    expect(presentation.targetValue).toBe('1 NEAR');
    expect(presentation.showProposerSeparately).toBe(true);
    expect(presentation.onChainDescription).toBe(
      'I would like to test transfer.'
    );
  });

  it('formats fund season pool with season label and amount', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description:
        'Fund season-one season pool with 1000000000000000000000 yocto SOCIAL from social-spend treasury.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'fund_season_pool_from_treasury',
              args: encodeArgs({
                season_id: 'season-one',
                amount: '1000000000000000000000',
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.subjectEyebrow).toBe('Season');
    expect(presentation.subjectText).toBe('season-one');
    expect(presentation.targetValue).toBe('1000 SOCIAL');
    expect(presentation.showProposerSeparately).toBe(true);
  });

  it('shows Signal badge for vote proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Should we launch season two next month?',
      kind: { Vote: null },
    });

    expect(presentation.actionBadge).toBe('Signal');
    expect(presentation.subjectEyebrow).toBe('Proposer');
    expect(presentation.showProposerSeparately).toBe(false);
  });

  it('shows Signal badge when vote kind is a plain string from NEAR', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description:
        'How about we create staking contract for treasury DAO also?',
      kind: 'Vote',
    });

    expect(presentation.actionBadge).toBe('Signal');
    expect(presentation.subjectEyebrow).toBe('Proposer');
  });

  it('formats fund season pool from DAO wallet via ft_transfer_call', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'treasury.onsocial.testnet',
      description:
        'Fund season-one rally pool with 500 SOCIAL from the DAO treasury.',
      kind: {
        FunctionCall: {
          receiver_id: 'token.onsocial.testnet',
          actions: [
            {
              method_name: 'ft_transfer_call',
              args: encodeArgs({
                receiver_id: 'social-spend.onsocial.testnet',
                amount: '500000000000000000000',
                msg: JSON.stringify({
                  v: 1,
                  action: 'fund_season_pool',
                  season_id: 'season-one',
                }),
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.subjectEyebrow).toBe('Season');
    expect(presentation.subjectText).toBe('season-one');
    expect(presentation.targetValue).toBe('500 SOCIAL');
    expect(presentation.showProposerSeparately).toBe(true);
  });

  it('labels proposer on role update policy proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description: 'Raise delegated proposers threshold to 100 SOCIAL.',
      kind: {
        ChangePolicyAddOrUpdateRole: {
          role: {
            name: 'delegated_proposers',
            kind: 'Member',
            permissions: ['*:*'],
            vote_policy: {},
          },
        },
      },
    });

    expect(presentation.subjectEyebrow).toBe('Proposer');
    expect(presentation.subjectAccount).toBe('greenghost.onsocial.testnet');
    expect(presentation.showProposerSeparately).toBe(false);
    expect(presentation.targetValue).toBe('Delegated proposers');
  });

  it('shows staking contract target for SetStakingContract proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description: 'Treasury DAO: set staking contract for council voting.',
      kind: {
        SetStakingContract: {
          staking_id: 'staking-treasury.onsocial.testnet',
        },
      },
    });

    expect(presentation.actionBadge).toBe('Staking');
    expect(presentation.subjectEyebrow).toBe('Proposer');
    expect(presentation.subjectAccount).toBe('greenghost.onsocial.testnet');
    expect(presentation.targetKind).toBe('contract');
    expect(presentation.targetValue).toBe('Staking treasury');
    expect(presentation.targetAccountId).toBe(
      'staking-treasury.onsocial.testnet'
    );
    expect(presentation.showProposerSeparately).toBe(false);
  });

  it('shows Proposer Self for self-nominated membership proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'test03.onsocial.testnet',
      description: 'Id love to take part',
      kind: {
        AddMemberToRole: {
          member_id: 'test03.onsocial.testnet',
          role: 'guardians',
        },
      },
    });

    expect(presentation.subjectEyebrow).toBe('Member');
    expect(presentation.subjectAccount).toBe('test03.onsocial.testnet');
    expect(presentation.targetValue).toBe('Guardians');
    expect(presentation.showProposerSeparately).toBe(false);
    expect(presentation.showProposerAsSelf).toBe(true);
  });

  it('shows separate proposer row when nominating another member', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Add Bob to council.',
      kind: {
        AddMemberToRole: {
          member_id: 'bob.testnet',
          role: 'council',
        },
      },
    });

    expect(presentation.showProposerAsSelf).toBe(false);
    expect(presentation.showProposerSeparately).toBe(true);
  });

  it('shows Proposer Self for self-initiated leave proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'test03.onsocial.testnet',
      description: 'Stepping down from guardians.',
      kind: {
        RemoveMemberFromRole: {
          member_id: 'test03.onsocial.testnet',
          role: 'guardians',
        },
      },
    });

    expect(presentation.actionBadge).toBe('Leave');
    expect(presentation.subjectEyebrow).toBe('Member');
    expect(presentation.showProposerAsSelf).toBe(true);
    expect(presentation.showProposerSeparately).toBe(false);
  });
});

describe('proposal card target eyebrows', () => {
  it('maps every structured target kind to a right-column eyebrow', () => {
    expect(resolveProposalTargetEyebrowLabel('role')).toBe('Role');
    expect(resolveProposalTargetEyebrowLabel('community')).toBe('Community');
    expect(resolveProposalTargetEyebrowLabel('contract')).toBe('Contract');
    expect(resolveProposalTargetEyebrowLabel('amount')).toBe('Amount');
    expect(resolveProposalTargetEyebrowLabel('code_hash')).toBe('Code hash');
    expect(resolveProposalTargetEyebrowLabel(null)).toBeNull();
  });

  it('uses Amount for treasury Transfer proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description: 'Treasury payout.',
      kind: {
        Transfer: {
          receiver_id: 'treasury.onsocial.testnet',
          amount: '1000000000000000000000000',
          token_id: '',
        },
      },
    });

    expect(presentation.targetKind).toBe('amount');
    expect(resolveProposalTargetEyebrowLabel(presentation.targetKind)).toBe(
      'Amount'
    );
  });

  it('shows contract upgrade code hash on proposal cards', () => {
    const codeHash = '85a9kdWatcHHkpmNu3pDyLvZ9wJkmTqhXVLhGsd17y16';
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Upgrade social-spend for burn routing.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'update_contract_from_hash',
              args: encodeArgs({ code_hash: codeHash }),
              deposit: '0',
              gas: 250_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Upgrade');
    expect(presentation.targetKind).toBe('code_hash');
    expect(presentation.targetValue).toBe('85a9kdWatc…Gsd17y16');
    expect(presentation.targetAccountId).toBe(codeHash);
    expect(presentation.subjectAccount).toBe('social-spend.onsocial.testnet');
    expect(presentation.subjectEyebrow).toBe('Contract');
  });

  it('shows join rally routing on contract config proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Enable burn on join rally.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'set_action_config',
              args: encodeArgs({
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
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Config');
    expect(presentation.targetKind).toBe('routing');
    expect(presentation.targetValue).toBe(
      'min 100 SOCIAL · 95% pool · 5% burn'
    );
    expect(presentation.headline).toBe('Set Social spend join rally routing');
  });

  it('shows support profile routing on contract config proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Fix profile support minimum.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'set_action_config',
              args: encodeArgs({
                action_id: 'support_profile',
                config: {
                  label: 'Support Profile',
                  active: true,
                  min_amount: SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
                  target_types: ['profile'],
                  treasury_bps: 100,
                  season_pool_bps: 0,
                  target_bps: 9900,
                  burn_bps: 0,
                  season_required: false,
                  allow_self_target: false,
                },
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Config');
    expect(presentation.targetKind).toBe('routing');
    expect(presentation.targetValue).toBe(
      'min 0.01 SOCIAL · 1% boost credits · 99% target'
    );
    expect(presentation.headline).toBe(
      'Set Social spend support profile routing'
    );
  });

  it('shows support endorsement routing on contract config proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Enable endorsement support spends.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'set_action_config',
              args: encodeArgs({
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
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Config');
    expect(presentation.targetKind).toBe('routing');
    expect(presentation.targetValue).toBe(
      'min 0.01 SOCIAL · 5% boost credits · 95% target'
    );
    expect(presentation.headline).toBe(
      'Set Social spend support endorsement routing'
    );
  });

  it('shows boost post routing on contract config proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Adjust post boost minimum.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'set_action_config',
              args: encodeArgs({
                action_id: 'boost_post',
                config: {
                  label: 'Boost Post',
                  active: true,
                  min_amount: SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
                  target_types: ['post'],
                  treasury_bps: 1000,
                  season_pool_bps: 0,
                  target_bps: 9000,
                  burn_bps: 0,
                  season_required: false,
                  allow_self_target: true,
                },
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Config');
    expect(presentation.targetKind).toBe('routing');
    expect(presentation.targetValue).toBe(
      'min 0.01 SOCIAL · 10% boost credits · 90% target'
    );
    expect(presentation.headline).toBe('Set Social spend boost post routing');
  });

  it('shows contract on the left and season on the right for season config', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'greenghost.onsocial.testnet',
      description: 'Starting rally to test season config.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'set_season_config',
              args: encodeArgs({
                season_id: 'season-two',
                config: {
                  label: 'OnSocial Rally',
                  active: true,
                  starts_at_ns: '1710000000000000000',
                  ends_at_ns: '1710252000000000000',
                  claim_starts_at_ns: null,
                },
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Config');
    expect(presentation.headline).toBe('Start OnSocial Rally rally season');
    expect(presentation.subjectEyebrow).toBe('Contract');
    expect(presentation.subjectAccount).toBe('social-spend.onsocial.testnet');
    expect(presentation.targetKind).toBe('season');
    expect(presentation.targetValue).toBe('season-two');
    expect(presentation.targetAccountId).toBeNull();
  });

  it('shows boost contract target on contract config proposals', () => {
    const presentation = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Route protocol fees to boost credits.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'set_boost_contract_id',
              args: encodeArgs({
                boost_contract_id: 'boost.onsocial.testnet',
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(presentation.actionBadge).toBe('Config');
    expect(presentation.targetKind).toBe('contract');
    expect(presentation.targetValue).toBe('Boost');
    expect(presentation.headline).toBe(
      'Set Social spend boost contract to Boost'
    );
  });

  it('uses Amount for treasury sweep and fund-season proposals', () => {
    const sweep = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Sweep treasury fees.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'withdraw_treasury',
              args: encodeArgs({ amount: '10000000000000000000' }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });
    const fund = deriveProposalPresentation({
      proposer: 'alice.testnet',
      description: 'Fund season pool.',
      kind: {
        FunctionCall: {
          receiver_id: 'social-spend.onsocial.testnet',
          actions: [
            {
              method_name: 'fund_season_pool_from_treasury',
              args: encodeArgs({
                season_id: 'season-one',
                amount: '1000000000000000000000',
              }),
              deposit: '1',
              gas: 100_000_000_000_000,
            },
          ],
        },
      },
    });

    expect(sweep.targetKind).toBe('amount');
    expect(fund.targetKind).toBe('amount');
    expect(resolveProposalTargetEyebrowLabel(sweep.targetKind)).toBe('Amount');
    expect(resolveProposalTargetEyebrowLabel(fund.targetKind)).toBe('Amount');
  });
});
