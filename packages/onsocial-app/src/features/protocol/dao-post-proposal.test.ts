import { describe, expect, it } from 'vitest';
import { buildDaoPostProposalPayload } from './dao-post-proposal';
import { CORE_CONTRACT } from '@/lib/app-near-contract';

describe('buildDaoPostProposalPayload', () => {
  it('builds a Call execute proposal for a text post', () => {
    const payload = buildDaoPostProposalPayload({
      post: { text: 'Hello from the DAO' },
      postId: '42',
      daoLabel: 'Governance',
      now: 99,
    });
    const kind = payload.proposal.kind as {
      FunctionCall: {
        receiver_id: string;
        actions: Array<{ method_name: string; args: string }>;
      };
    };
    expect(kind.FunctionCall.receiver_id).toBe(CORE_CONTRACT);
    expect(kind.FunctionCall.actions[0]?.method_name).toBe('execute');
    expect(payload.proposal.description).toContain('Governance');
    expect(payload.proposal.description).toContain('Hello from the DAO');

    const argsJson = Buffer.from(
      kind.FunctionCall.actions[0]!.args,
      'base64'
    ).toString('utf8');
    const args = JSON.parse(argsJson) as {
      request: { action: { type: string; data: Record<string, unknown> } };
    };
    expect(args.request.action.type).toBe('set');
    expect(args.request.action.data['post/42']).toMatchObject({
      text: 'Hello from the DAO',
      timestamp: 99,
    });
  });

  it('rejects empty posts', () => {
    expect(() =>
      buildDaoPostProposalPayload({
        post: { text: '   ' },
        postId: '1',
      })
    ).toThrow(/text or media/i);
  });
});
