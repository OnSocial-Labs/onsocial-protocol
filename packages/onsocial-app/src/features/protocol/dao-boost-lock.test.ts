import { describe, expect, it } from 'vitest';
import { buildDaoBoostLockProposalPayload } from './dao-boost-lock';
import {
  BOOST_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';

describe('buildDaoBoostLockProposalPayload', () => {
  it('builds ft_transfer_call lock to the boost contract', () => {
    const amount = '100000000000000000000'; // 100 SOCIAL
    const payload = buildDaoBoostLockProposalPayload({
      amountYocto: amount,
      months: 12,
      daoLabel: 'Governance',
    });
    const kind = payload.proposal.kind as {
      FunctionCall: {
        receiver_id: string;
        actions: Array<{
          method_name: string;
          args: string;
          deposit: string;
        }>;
      };
    };
    expect(kind.FunctionCall.receiver_id).toBe(SOCIAL_TOKEN_CONTRACT);
    expect(kind.FunctionCall.actions[0]?.method_name).toBe('ft_transfer_call');
    expect(kind.FunctionCall.actions[0]?.deposit).toBe('1');
    expect(payload.proposal.description).toContain('Governance');
    expect(payload.proposal.description).toContain('12 mo');

    const argsJson = Buffer.from(
      kind.FunctionCall.actions[0]!.args,
      'base64'
    ).toString('utf8');
    const args = JSON.parse(argsJson) as {
      receiver_id: string;
      amount: string;
      msg: string;
    };
    expect(args.receiver_id).toBe(BOOST_CONTRACT);
    expect(args.amount).toBe(amount);
    expect(JSON.parse(args.msg)).toEqual({ action: 'lock', months: 12 });
  });

  it('rejects amounts below the Boost minimum', () => {
    expect(() =>
      buildDaoBoostLockProposalPayload({
        amountYocto: '1',
        months: 12,
      })
    ).toThrow(/minimum/i);
  });
});
