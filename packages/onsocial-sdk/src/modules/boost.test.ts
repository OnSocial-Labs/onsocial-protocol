import { describe, expect, it, vi } from 'vitest';
import { BoostModule } from './boost.js';

describe('BoostModule.getStats', () => {
  it('GETs /data/boost-stats and returns the body verbatim', async () => {
    const stats = {
      version: '0.1.0',
      token_id: 'token.onsocial.testnet',
      owner_id: 'onsocial.testnet',
      total_locked: '0',
      total_effective_boost: '0',
      total_boost_seconds: '0',
      total_rewards_released: '0',
      scheduled_pool: '0',
      infra_pool: '0',
      last_release_time: 0,
      active_weekly_rate_bps: 0,
      release_schedule_start_ns: 0,
      initial_weekly_rate_bps: 0,
      rate_step_bps: 0,
      rate_step_interval_months: 0,
      max_weekly_rate_bps: 0,
    };
    const get = vi.fn().mockResolvedValue(stats);
    const boost = new BoostModule({ get } as never);
    const out = await boost.getStats();
    expect(get).toHaveBeenCalledWith('/data/boost-stats');
    expect(out).toEqual(stats);
  });
});

describe('BoostModule.getAccount', () => {
  it('encodes accountId and returns the AccountView shape', async () => {
    const view = {
      locked_amount: '0',
      unlock_at: 0,
      lock_months: 0,
      effective_boost: '0',
      claimable_rewards: '0',
      boost_seconds: '0',
      rewards_claimed: '0',
    };
    const get = vi.fn().mockResolvedValue(view);
    const boost = new BoostModule({ get } as never);
    const out = await boost.getAccount('alice.testnet');
    expect(get).toHaveBeenCalledWith(
      '/data/boost-account?accountId=alice.testnet'
    );
    expect(out).toEqual(view);
  });
});

describe('BoostModule.getLockStatus', () => {
  it('GETs /data/boost-lock-status', async () => {
    const status = {
      is_locked: false,
      locked_amount: '0',
      lock_months: 0,
      unlock_at: 0,
      can_unlock: false,
      time_remaining_ns: 0,
      bonus_percent: 0,
      effective_boost: '0',
      lock_expired: false,
    };
    const get = vi.fn().mockResolvedValue(status);
    const boost = new BoostModule({ get } as never);
    const out = await boost.getLockStatus('alice.testnet');
    expect(get).toHaveBeenCalledWith(
      '/data/boost-lock-status?accountId=alice.testnet'
    );
    expect(out).toEqual(status);
  });
});

describe('BoostModule.getRewardRate', () => {
  it('GETs /data/boost-reward-rate', async () => {
    const rate = {
      claimable_now: '0',
      rewards_per_second: '0',
      effective_boost: '0',
      total_effective_boost: '0',
      weekly_pool_release: '0',
      active_weekly_rate_bps: 0,
    };
    const get = vi.fn().mockResolvedValue(rate);
    const boost = new BoostModule({ get } as never);
    const out = await boost.getRewardRate('alice.testnet');
    expect(get).toHaveBeenCalledWith(
      '/data/boost-reward-rate?accountId=alice.testnet'
    );
    expect(out).toEqual(rate);
  });
});

describe('BoostModule.getStorageSubsidyAvailable', () => {
  it('GETs /data/boost-storage-subsidy-available and returns a number', async () => {
    const get = vi.fn().mockResolvedValue(123);
    const boost = new BoostModule({ get } as never);
    const out = await boost.getStorageSubsidyAvailable();
    expect(get).toHaveBeenCalledWith('/data/boost-storage-subsidy-available');
    expect(out).toBe(123);
  });
});

describe('BoostModule.storageBalanceOf', () => {
  it('returns null when the contract returns null', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const boost = new BoostModule({ get } as never);
    const out = await boost.storageBalanceOf('bob.testnet');
    expect(get).toHaveBeenCalledWith(
      '/data/boost-storage-balance?accountId=bob.testnet'
    );
    expect(out).toBeNull();
  });

  it('returns the storage-balance object verbatim', async () => {
    const bal = { total: '7250000000000000000000', available: '0' };
    const get = vi.fn().mockResolvedValue(bal);
    const boost = new BoostModule({ get } as never);
    const out = await boost.storageBalanceOf('alice.testnet');
    expect(out).toEqual(bal);
  });
});
