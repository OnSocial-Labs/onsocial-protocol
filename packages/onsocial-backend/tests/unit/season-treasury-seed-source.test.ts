import { describe, expect, it } from 'vitest';

import {
  parseFundSeasonPoolProposal,
  resolveFundSeasonProposalSource,
} from '../../src/services/seasons/season-treasury-seed-source.js';

function encodeArgs(args: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(args)).toString('base64');
}

describe('season-treasury-seed-source', () => {
  it('parses fund season pool from treasury function calls', () => {
    expect(
      parseFundSeasonPoolProposal({
        kind: {
          FunctionCall: {
            receiver_id: 'social-spend.onsocial.testnet',
            actions: [
              {
                method_name: 'fund_season_pool_from_treasury',
                args: encodeArgs({
                  season_id: 'season-zero',
                  amount: '50000000000000000000000000',
                }),
              },
            ],
          },
        },
      })
    ).toEqual({
      seasonId: 'season-zero',
      amountYocto: '50000000000000000000000000',
    });
  });

  it('parses fund season pool from ft_transfer_call msg', () => {
    expect(
      parseFundSeasonPoolProposal({
        kind: {
          FunctionCall: {
            receiver_id: 'token.onsocial.testnet',
            actions: [
              {
                method_name: 'ft_transfer_call',
                args: encodeArgs({
                  receiver_id: 'social-spend.onsocial.testnet',
                  amount: '1000000000000000000000',
                  msg: JSON.stringify({
                    action: 'fund_season_pool',
                    season_id: 'season-zero',
                  }),
                }),
              },
            ],
          },
        },
      })
    ).toEqual({
      seasonId: 'season-zero',
      amountYocto: '1000000000000000000000',
    });
  });

  it('resolves the best approved fund-season proposal for a season', () => {
    const source = resolveFundSeasonProposalSource({
      seasonId: 'season-zero',
      sponsoredPoolYocto: '50000000000000000000000000',
      proposals: [
        {
          proposalId: 3,
          daoAccountId: 'treasury.onsocial.testnet',
          status: 'Rejected',
          proposalSnapshot: {
            id: 3,
            proposer: 'alice.testnet',
            description: 'Rejected seed',
            kind: {
              FunctionCall: {
                receiver_id: 'token.onsocial.testnet',
                actions: [
                  {
                    method_name: 'ft_transfer_call',
                    args: encodeArgs({
                      amount: '50000000000000000000000000',
                      msg: JSON.stringify({
                        action: 'fund_season_pool',
                        season_id: 'season-zero',
                      }),
                    }),
                  },
                ],
              },
            },
            status: 'Rejected',
            vote_counts: {},
            votes: {},
            submission_time: '1',
          },
        },
        {
          proposalId: 7,
          daoAccountId: 'treasury.onsocial.testnet',
          status: 'Approved',
          proposalSnapshot: {
            id: 7,
            proposer: 'dao.testnet',
            description: 'Approved seed',
            kind: {
              FunctionCall: {
                receiver_id: 'token.onsocial.testnet',
                actions: [
                  {
                    method_name: 'ft_transfer_call',
                    args: encodeArgs({
                      amount: '50000000000000000000000000',
                      msg: JSON.stringify({
                        action: 'fund_season_pool',
                        season_id: 'season-zero',
                      }),
                    }),
                  },
                ],
              },
            },
            status: 'Approved',
            vote_counts: {},
            votes: {},
            submission_time: '2',
          },
        },
      ],
    });

    expect(source).toEqual({
      kind: 'proposal',
      appId: 'protocol-proposal-7',
      proposalId: 7,
      daoAccountId: 'treasury.onsocial.testnet',
    });
  });

  it('prefers treasury DAO fund-season proposals over governance', () => {
    const source = resolveFundSeasonProposalSource({
      seasonId: 'season-two',
      sponsoredPoolYocto: '100000000000000000000',
      proposals: [
        {
          proposalId: 2,
          daoAccountId: 'governance.onsocial.testnet',
          status: 'Approved',
          proposalSnapshot: {
            id: 2,
            proposer: 'alice.testnet',
            description: 'Wrong board',
            kind: {
              FunctionCall: {
                receiver_id: 'token.onsocial.testnet',
                actions: [
                  {
                    method_name: 'ft_transfer_call',
                    args: encodeArgs({
                      amount: '100000000000000000000',
                      msg: JSON.stringify({
                        action: 'fund_season_pool',
                        season_id: 'season-two',
                      }),
                    }),
                  },
                ],
              },
            },
            status: 'Approved',
            vote_counts: {},
            votes: {},
            submission_time: '1',
          },
        },
        {
          proposalId: 12,
          daoAccountId: 'treasury.onsocial.testnet',
          status: 'Approved',
          proposalSnapshot: {
            id: 12,
            proposer: 'treasury.onsocial.testnet',
            description: 'Treasury seed',
            kind: {
              FunctionCall: {
                receiver_id: 'token.onsocial.testnet',
                actions: [
                  {
                    method_name: 'ft_transfer_call',
                    args: encodeArgs({
                      amount: '100000000000000000000',
                      msg: JSON.stringify({
                        v: 1,
                        action: 'fund_season_pool',
                        season_id: 'season-two',
                      }),
                    }),
                  },
                ],
              },
            },
            status: 'Approved',
            vote_counts: {},
            votes: {},
            submission_time: '2',
          },
        },
      ],
    });

    expect(source).toEqual({
      kind: 'proposal',
      appId: 'protocol-proposal-12',
      proposalId: 12,
      daoAccountId: 'treasury.onsocial.testnet',
    });
  });
});
