// ---------------------------------------------------------------------------
// OnSocial SDK — boost module (boost contract view reads)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type { FtStorageBalance } from './token.js';

/** Per-account boost view as returned by `get_account`. */
export interface BoostAccountView {
  locked_amount: string;
  unlock_at: number;
  lock_months: number;
  effective_boost: string;
  claimable_rewards: string;
  boost_seconds: string;
  rewards_claimed: string;
}

/** Contract-wide stats as returned by `get_stats`. */
export interface BoostContractStats {
  version: string;
  token_id: string;
  owner_id: string;
  total_locked: string;
  total_effective_boost: string;
  total_boost_seconds: string;
  total_rewards_released: string;
  scheduled_pool: string;
  infra_pool: string;
  last_release_time: number;
  active_weekly_rate_bps: number;
  release_schedule_start_ns: number;
  initial_weekly_rate_bps: number;
  rate_step_bps: number;
  rate_step_interval_months: number;
  max_weekly_rate_bps: number;
}

/** Account lock state as returned by `get_lock_status`. */
export interface BoostLockStatus {
  is_locked: boolean;
  locked_amount: string;
  lock_months: number;
  unlock_at: number;
  can_unlock: boolean;
  time_remaining_ns: number;
  bonus_percent: number;
  effective_boost: string;
  lock_expired: boolean;
}

/** Live reward-rate view as returned by `get_reward_rate`. */
export interface BoostRewardRate {
  claimable_now: string;
  rewards_per_second: string;
  effective_boost: string;
  total_effective_boost: string;
  weekly_pool_release: string;
  active_weekly_rate_bps: number;
}

/**
 * Boost — read-only views for the boost (lock-and-earn) contract.
 *
 * Wraps the gateway `/data/boost-*` endpoints, which proxy the configured
 * boost contract on the active network (`boost.onsocial.testnet` or
 * `boost.onsocial.near`).
 *
 * For event history and leaderboards use `os.query.boost.*`.
 *
 * ```ts
 * const stats = await os.boost.getStats();
 * const account = await os.boost.getAccount('alice.testnet');
 * const rate = await os.boost.getRewardRate('alice.testnet');
 * ```
 */
export class BoostModule {
  constructor(private _http: HttpClient) {}

  /** Returns global contract stats and current release-rate parameters. */
  async getStats(): Promise<BoostContractStats> {
    return this._http.get<BoostContractStats>(`/data/boost-stats`);
  }

  /** Returns the per-account boost view (zero-valued for unknown accounts). */
  async getAccount(accountId: string): Promise<BoostAccountView> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<BoostAccountView>(`/data/boost-account?${p}`);
  }

  /** Returns the lock state, time-remaining, and unlock-eligibility flag. */
  async getLockStatus(accountId: string): Promise<BoostLockStatus> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<BoostLockStatus>(`/data/boost-lock-status?${p}`);
  }

  /** Returns the live reward-rate snapshot for live UI counters. */
  async getRewardRate(accountId: string): Promise<BoostRewardRate> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<BoostRewardRate>(`/data/boost-reward-rate?${p}`);
  }

  /** How many new users the contract can still auto-register for free. */
  async getStorageSubsidyAvailable(): Promise<number> {
    return this._http.get<number>(`/data/boost-storage-subsidy-available`);
  }

  /** Returns the NEP-145 storage balance, or `null` if unregistered. */
  async storageBalanceOf(accountId: string): Promise<FtStorageBalance | null> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<FtStorageBalance | null>(
      `/data/boost-storage-balance?${p}`
    );
  }
}
