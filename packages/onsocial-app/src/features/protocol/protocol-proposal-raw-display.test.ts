import { describe, expect, it } from 'vitest';
import { formatProtocolDaoProposalForRawDisplay } from '@/features/protocol/protocol-proposal-raw-display';
import type { ProtocolDaoProposal } from '@/features/protocol/types';

describe('formatProtocolDaoProposalForRawDisplay', () => {
  it('decodes FunctionCall base64 args for readable JSON', () => {
    const args = Buffer.from(
      JSON.stringify({ amount: '1000', season_id: 's2' }),
      'utf8'
    ).toString('base64');
    const proposal: ProtocolDaoProposal = {
      id: 12,
      proposer: 'alice.near',
      description: 'Fund season',
      status: 'InProgress',
      kind: {
        FunctionCall: {
          receiver_id: 'token.near',
          actions: [
            {
              method_name: 'ft_transfer_call',
              args,
              deposit: '1',
              gas: '30000000000000',
            },
          ],
        },
      },
      vote_counts: { council: ['1', '0', '0'] },
      votes: { 'alice.near': 'Approve' },
      submission_time: '1700000000000000000',
    };

    const json = formatProtocolDaoProposalForRawDisplay(proposal, 12);
    const parsed = JSON.parse(json) as {
      id: number;
      kind: {
        FunctionCall: {
          actions: Array<{ args: { amount: string; season_id: string } }>;
        };
      };
    };

    expect(parsed.id).toBe(12);
    expect(parsed.kind.FunctionCall.actions[0]?.args).toEqual({
      amount: '1000',
      season_id: 's2',
    });
  });
});
