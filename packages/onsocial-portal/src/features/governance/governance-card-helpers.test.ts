import { describe, expect, it } from 'vitest';
import { formatGovernanceDaoProposalForRawDisplay } from '@/features/governance/governance-card-helpers';

function encodeArgs(args: Record<string, unknown>): string {
  return btoa(JSON.stringify(args));
}

describe('formatGovernanceDaoProposalForRawDisplay', () => {
  it('decodes base64 function call args for readable raw output', () => {
    const json = formatGovernanceDaoProposalForRawDisplay(
      {
        proposer: 'alice.testnet',
        description: 'Configure join rally routing.',
        status: 'Approved',
        kind: {
          FunctionCall: {
            receiver_id: 'social-spend.onsocial.testnet',
            actions: [
              {
                method_name: 'set_action_config',
                args: encodeArgs({
                  action_id: 'join_rally',
                  config: {
                    min_amount: '100000000000000000000',
                    season_pool_bps: 9500,
                    treasury_bps: 400,
                    burn_bps: 100,
                  },
                }),
                deposit: '1',
                gas: '100000000000000000',
              },
            ],
          },
        },
        vote_counts: { council: ['2', '0', '0'] },
        votes: { 'bob.testnet': 'Approve' },
        submission_time: '1710000000000000000',
        resolved_at: '1710100000000000000',
      },
      45
    );

    const parsed = JSON.parse(json) as {
      id: number;
      kind: {
        FunctionCall: {
          actions: Array<{
            args: {
              action_id: string;
              config: { min_amount: string; burn_bps: number };
            };
          }>;
        };
      };
    };

    expect(parsed.id).toBe(45);
    expect(parsed.kind.FunctionCall.actions[0].args.action_id).toBe(
      'join_rally'
    );
    expect(parsed.kind.FunctionCall.actions[0].args.config.min_amount).toBe(
      '100000000000000000000'
    );
    expect(parsed.kind.FunctionCall.actions[0].args.config.burn_bps).toBe(100);
  });
});
