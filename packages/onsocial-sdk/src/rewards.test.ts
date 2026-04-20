import { describe, expect, it, vi } from 'vitest';
import {
  RewardsModule,
  buildClaimAction,
  buildCreditRewardAction,
} from './rewards.js';

describe('rewards action builders', () => {
  it('builds a canonical credit_reward action', () => {
    expect(
      buildCreditRewardAction({
        accountId: 'alice.near',
        amount: '1000',
        source: 'message',
        appId: 'chat',
      })
    ).toEqual({
      type: 'credit_reward',
      account_id: 'alice.near',
      amount: '1000',
      source: 'message',
      app_id: 'chat',
    });
  });

  it('builds a canonical claim action', () => {
    expect(buildClaimAction()).toEqual({ type: 'claim' });
  });
});

describe('RewardsModule transport', () => {
  it('maps credit request fields to backend snake_case', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
    const rewards = new RewardsModule({ post } as never);

    await rewards.credit({
      accountId: 'alice.near',
      amount: '1000',
      source: 'message',
      appId: 'chat',
    });

    expect(post).toHaveBeenCalledWith('/v1/reward', {
      account_id: 'alice.near',
      amount: '1000',
      source: 'message',
      app_id: 'chat',
    });
  });

  it('maps claim request fields to backend snake_case', async () => {
    const post = vi.fn().mockResolvedValue({ claimed: '0' });
    const rewards = new RewardsModule({ post } as never);

    const result = await rewards.claim('alice.near');

    expect(post).toHaveBeenCalledWith('/v1/claim', {
      account_id: 'alice.near',
    });
    expect(result.claimed).toBe('0');
    expect(result.txHash).toBeUndefined();
  });

  it('preserves txHash when reward credit returns one', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'reward-tx' });
    const rewards = new RewardsModule({ post } as never);

    const result = await rewards.credit({ accountId: 'alice.near' });

    expect(result.txHash).toBe('reward-tx');
    expect(result.ok).toBeUndefined();
  });
});
