import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/app-config', () => ({
  SOCIAL_SPEND_CONTRACT: 'social-spend.onsocial.testnet',
}));

import {
  DAO_CLAIM_SUPPORT_CALL_GAS,
  buildDaoClaimSupportProposalPayload,
} from './dao-claim-support';

describe('buildDaoClaimSupportProposalPayload', () => {
  it('builds a full-pot claim Call to social-spend', () => {
    const payload = buildDaoClaimSupportProposalPayload({
      daoLabel: 'OnSocial Governance',
    });

    expect(payload.proposal.description).toContain('Claim unclaimed Support');
    expect(payload.proposal.description).toContain('OnSocial Governance');
    const kind = payload.proposal.kind as {
      FunctionCall: {
        receiver_id: string;
        actions: Array<{
          method_name: string;
          args: string;
          deposit: string;
          gas: string;
        }>;
      };
    };
    expect(kind.FunctionCall.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(kind.FunctionCall.actions[0]?.method_name).toBe(
      'claim_target_balance'
    );
    expect(kind.FunctionCall.actions[0]?.deposit).toBe('0');
    expect(kind.FunctionCall.actions[0]?.gas).toBe(DAO_CLAIM_SUPPORT_CALL_GAS);

    const decoded = JSON.parse(
      Buffer.from(kind.FunctionCall.actions[0]!.args, 'base64').toString('utf8')
    ) as Record<string, unknown>;
    expect(decoded).toEqual({});
  });

  it('includes amount when partial claim is requested', () => {
    const payload = buildDaoClaimSupportProposalPayload({
      amountYocto: '1000000000000000000000000',
      amountLabel: '1 SOCIAL',
    });
    expect(payload.proposal.description).toContain('1 SOCIAL');
    const kind = payload.proposal.kind as {
      FunctionCall: { actions: Array<{ args: string }> };
    };
    const decoded = JSON.parse(
      Buffer.from(kind.FunctionCall.actions[0]!.args, 'base64').toString('utf8')
    ) as { amount?: string };
    expect(decoded.amount).toBe('1000000000000000000000000');
  });
});
