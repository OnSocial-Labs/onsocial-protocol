import { describe, expect, it } from 'vitest';
import { deriveProposalPresentation } from './governance-proposal-presentation';

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
