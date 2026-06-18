import { describe, expect, it, vi } from 'vitest';
import { SocialSpendModule } from './social-spend.js';
import {
  SocialSpendSignerRequiredError,
  buildSocialSpendClaimSeasonRewardTransaction,
  buildSocialSpendClaimTargetBalanceTransaction,
  buildSocialSpendFtTransferCallArgs,
  buildSocialSpendMsg,
  buildSocialSpendTransaction,
} from './social-spend.js';

const http = { network: 'testnet' } as never;

describe('buildSocialSpendMsg', () => {
  it('builds the contract wire envelope and omits undefined fields', () => {
    const msg = buildSocialSpendMsg({
      amount: '1000000000000000000',
      action: 'join_rally',
      targetType: 'rally',
      targetId: 'season0',
      seasonId: 'season0',
      tag: 'first-spend',
      metadata: { source: 'test' },
    });

    expect(msg).toEqual({
      v: 1,
      app_id: 'portal',
      action: 'join_rally',
      target_type: 'rally',
      target_id: 'season0',
      season_id: 'season0',
      tag: 'first-spend',
      metadata: { source: 'test' },
    });
  });
});

describe('buildSocialSpendFtTransferCallArgs', () => {
  it('wraps a spend as ft_transfer_call args', () => {
    const args = buildSocialSpendFtTransferCallArgs(
      {
        amount: 1000000000000000000n,
        appId: 'portal',
        action: 'support_profile',
        targetType: 'profile',
        targetId: 'alice.testnet',
      },
      'social-spend.onsocial.testnet'
    );

    expect(args.receiver_id).toBe('social-spend.onsocial.testnet');
    expect(args.amount).toBe('1000000000000000000');
    expect(JSON.parse(args.msg)).toEqual({
      v: 1,
      app_id: 'portal',
      action: 'support_profile',
      target_type: 'profile',
      target_id: 'alice.testnet',
    });
  });

  it('builds support_endorsement spend msg with recipient', () => {
    const msg = buildSocialSpendMsg({
      amount: '10000000000000000',
      action: 'support_endorsement',
      targetType: 'endorsement',
      targetId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      recipientId: 'bob.testnet',
      metadata: { issuer: 'alice.testnet', topic: 'dev' },
    });

    expect(msg).toEqual({
      v: 1,
      app_id: 'portal',
      action: 'support_endorsement',
      target_type: 'endorsement',
      target_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      recipient_id: 'bob.testnet',
      metadata: { issuer: 'alice.testnet', topic: 'dev' },
    });
  });
});

describe('buildSocialSpendTransaction', () => {
  it('targets the token contract with a 1 yocto ft_transfer_call', () => {
    const tx = buildSocialSpendTransaction(
      {
        amount: '10000000000000000',
        action: 'join_rally',
        targetType: 'rally',
        targetId: 'season0',
        seasonId: 'season0',
      },
      {
        tokenContractId: 'token.onsocial.testnet',
        socialSpendContractId: 'social-spend.onsocial.testnet',
      }
    );

    expect(tx.receiverId).toBe('token.onsocial.testnet');
    expect(tx.actions).toHaveLength(1);
    expect(tx.actions[0]).toMatchObject({
      type: 'FunctionCall',
      methodName: 'ft_transfer_call',
      gas: '150000000000000',
      deposit: '1',
    });
  });
});

describe('claim transaction builders', () => {
  it('builds a season reward claim call', () => {
    const tx = buildSocialSpendClaimSeasonRewardTransaction(
      { seasonId: 'season0', amount: '42', proof: ['proof-a'] },
      { socialSpendContractId: 'social-spend.onsocial.testnet' }
    );

    expect(tx).toEqual({
      receiverId: 'social-spend.onsocial.testnet',
      actions: [
        {
          type: 'FunctionCall',
          methodName: 'claim_season_reward',
          args: { season_id: 'season0', amount: '42', proof: ['proof-a'] },
          gas: '100000000000000',
          deposit: '0',
        },
      ],
    });
  });

  it('builds a target balance claim call', () => {
    const tx = buildSocialSpendClaimTargetBalanceTransaction(
      { amount: 7n },
      { socialSpendContractId: 'social-spend.onsocial.testnet' }
    );

    expect(tx.actions[0]?.methodName).toBe('claim_target_balance');
    expect(tx.actions[0]?.args).toEqual({ amount: '7' });
    expect(tx.actions[0]?.deposit).toBe('0');
  });
});

describe('SocialSpendModule', () => {
  it('uses the configured wallet broadcast signer', async () => {
    const signer = vi.fn().mockResolvedValue({ txHash: 'abc' });
    const socialSpend = new SocialSpendModule(http, () => ({
      kind: 'wallet',
      signer,
    }));

    const result = await socialSpend.joinRally('season0', '10000000000000000');

    expect(result).toEqual({ txHash: 'abc' });
    expect(signer).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'token.onsocial.testnet',
      })
    );
  });

  it('throws with a wallet-ready payload when no signer is available', async () => {
    const socialSpend = new SocialSpendModule(http);

    await expect(
      socialSpend.supportProfile('alice.testnet', '10000000000000000')
    ).rejects.toMatchObject({
      name: 'SocialSpendSignerRequiredError',
      code: 'SOCIAL_SPEND_SIGNER_REQUIRED',
      payload: expect.objectContaining({
        receiverId: 'token.onsocial.testnet',
      }),
    } satisfies Partial<SocialSpendSignerRequiredError>);
  });
});
