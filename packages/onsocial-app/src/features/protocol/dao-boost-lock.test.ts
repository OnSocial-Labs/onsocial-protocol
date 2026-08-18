import { describe, expect, it } from 'vitest';
import {
  buildDaoBoostCollectProposalPayload,
  buildDaoBoostExtendProposalPayload,
  buildDaoBoostLockProposalPayload,
  buildDaoBoostRenewProposalPayload,
  buildDaoBoostUnlockProposalPayload,
} from './dao-boost-lock';
import {
  BOOST_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';

function decodeAction(payload: {
  proposal: { kind: unknown };
}): { method: string; receiver: string; args: Record<string, unknown> } {
  const kind = payload.proposal.kind as {
    FunctionCall: {
      receiver_id: string;
      actions: Array<{ method_name: string; args: string }>;
    };
  };
  const action = kind.FunctionCall.actions[0]!;
  return {
    receiver: kind.FunctionCall.receiver_id,
    method: action.method_name,
    args: JSON.parse(
      Buffer.from(action.args, 'base64').toString('utf8')
    ) as Record<string, unknown>,
  };
}

describe('buildDaoBoostLockProposalPayload', () => {
  it('builds ft_transfer_call lock to the boost contract', () => {
    const amount = '100000000000000000000'; // 100 SOCIAL
    const payload = buildDaoBoostLockProposalPayload({
      amountYocto: amount,
      months: 12,
      daoLabel: 'Governance',
    });
    const decoded = decodeAction(payload);
    expect(decoded.receiver).toBe(SOCIAL_TOKEN_CONTRACT);
    expect(decoded.method).toBe('ft_transfer_call');
    expect(decoded.args.receiver_id).toBe(BOOST_CONTRACT);
    expect(decoded.args.amount).toBe(amount);
    expect(JSON.parse(String(decoded.args.msg))).toEqual({
      action: 'lock',
      months: 12,
    });
    expect(payload.proposal.description).toContain('Governance');
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

describe('DAO Boost lifecycle proposals', () => {
  it('builds claim_rewards / unlock / renew / extend Calls on boost', () => {
    expect(decodeAction(buildDaoBoostCollectProposalPayload())).toMatchObject({
      receiver: BOOST_CONTRACT,
      method: 'claim_rewards',
      args: {},
    });
    expect(decodeAction(buildDaoBoostUnlockProposalPayload())).toMatchObject({
      receiver: BOOST_CONTRACT,
      method: 'unlock',
    });
    expect(decodeAction(buildDaoBoostRenewProposalPayload())).toMatchObject({
      receiver: BOOST_CONTRACT,
      method: 'renew_lock',
    });
    expect(
      decodeAction(buildDaoBoostExtendProposalPayload({ months: 24 }))
    ).toMatchObject({
      receiver: BOOST_CONTRACT,
      method: 'extend_lock',
      args: { months: 24 },
    });
  });
});
