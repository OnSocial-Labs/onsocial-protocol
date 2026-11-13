// ---------------------------------------------------------------------------
// OnSocial SDK — boost module (boost contract view reads)
// ---------------------------------------------------------------------------

import {
  buildBoostLockMsg,
  encodeBoostFtMsg,
  type BoostLockPeriod,
} from '../advanced/boost-msg.js';
import type { Session } from '../advanced/session.js';
import { resolveContractId } from '../internal/contracts.js';
import { OnSocialError, type HttpClient } from '../internal/http.js';
import { relaySignedFunctionCall } from '../internal/session-bridge.js';
import type { RelayResponse } from '../types.js';
import type { FtStorageBalance } from './token.js';

/** Stable relayer refusal when the per-user daily boost budget is spent. */
export const BOOST_SPONSOR_DAILY_CAP = 'BOOST_SPONSOR_DAILY_CAP';

/** Prepaid gas for a boost lock `ft_transfer_call`. Matches the app sheet. */
export const BOOST_LOCK_GAS = '80000000000000';

export class BoostSponsorDailyCapError extends Error {
  readonly code = BOOST_SPONSOR_DAILY_CAP;
  constructor() {
    super("Today's free boost is used up.");
    this.name = 'BoostSponsorDailyCapError';
  }
}

export function isBoostSponsorDailyCapError(error: unknown): boolean {
  if (error instanceof BoostSponsorDailyCapError) return true;
  return (
    error instanceof OnSocialError && error.message === BOOST_SPONSOR_DAILY_CAP
  );
}

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
  /** Set via `set_infra_withdraw_authority`; may withdraw infra pool when set. */
  infra_withdraw_authority?: string | null;
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

/** Projected claimable + rate + block time for live UI counters. */
export interface BoostRewardsLiveSnapshot {
  claimable_rewards: string;
  rewards_per_second: string;
  as_of_timestamp_ns: number;
  effective_boost: string;
  total_effective_boost: string;
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

  /** Returns projected claimable, accrual rate, and chain timestamp in one view read. */
  async getRewardsLiveSnapshot(
    accountId: string
  ): Promise<BoostRewardsLiveSnapshot> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<BoostRewardsLiveSnapshot>(
      `/data/boost-rewards-live?${p}`
    );
  }

  /** How many new users the contract can still auto-register for free. */
  async getStorageSubsidyAvailable(): Promise<number> {
    return this._http.get<number>(`/data/boost-storage-subsidy-available`);
  }

  /**
   * Lock SOCIAL into boost through the gateway relayer.
   *
   * The session key must be permitted to call `ft_transfer_call` on the
   * SOCIAL token. The relayer pays the fee. A daily cap refusal throws
   * `BoostSponsorDailyCapError` so the caller can fall back to a wallet
   * transaction. A chain revert is not a cap refusal.
   */
  async commitLock(input: {
    session: Session;
    amountYocto: string;
    months: BoostLockPeriod;
    gas?: string;
  }): Promise<RelayResponse> {
    if (!/^\d+$/.test(input.amountYocto) || BigInt(input.amountYocto) <= 0n) {
      throw new Error('amount must be a positive integer yocto amount');
    }
    const tokenContractId = resolveContractId(this._http.network, 'token');
    const boostContractId = resolveContractId(this._http.network, 'boost');
    try {
      return await relaySignedFunctionCall(this._http, input.session, {
        receiverId: tokenContractId,
        methodName: 'ft_transfer_call',
        argsJson: JSON.stringify({
          receiver_id: boostContractId,
          amount: input.amountYocto,
          msg: encodeBoostFtMsg(buildBoostLockMsg(input.months)),
        }),
        gas: input.gas ?? BOOST_LOCK_GAS,
        depositYocto: '1',
        wait: true,
      });
    } catch (error) {
      if (
        isBoostSponsorDailyCapError(error) &&
        !(error instanceof BoostSponsorDailyCapError)
      ) {
        throw new BoostSponsorDailyCapError();
      }
      throw error;
    }
  }

  /** Returns the NEP-145 storage balance, or `null` if unregistered. */
  async storageBalanceOf(accountId: string): Promise<FtStorageBalance | null> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<FtStorageBalance | null>(
      `/data/boost-storage-balance?${p}`
    );
  }
}
