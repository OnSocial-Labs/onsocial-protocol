// Shared NEAR RPC client for portal pages — wraps @onsocial/rpc with retry,
// failover, and circuit breaker. Browser-safe (native fetch, zero Node.js deps).

import {
  createNearRpc,
  FALLBACK_RPC_URLS,
  type NearRpc,
  type Network,
} from '@onsocial/rpc'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NETWORK: Network =
  (process.env.NEXT_PUBLIC_NEAR_NETWORK as Network) ?? 'testnet'

export const REWARDS_CONTRACT =
  NETWORK === 'mainnet' ? 'rewards.onsocial.near' : 'rewards.onsocial.testnet'

export const STAKING_CONTRACT =
  NETWORK === 'mainnet' ? 'staking.onsocial.near' : 'staking.onsocial.testnet'

export const TOKEN_CONTRACT =
  NETWORK === 'mainnet' ? 'token.onsocial.near' : 'token.onsocial.testnet'

// ---------------------------------------------------------------------------
// Singleton — circuit breaker state persists across renders
// ---------------------------------------------------------------------------

let _rpc: NearRpc | null = null

function getRpc(): NearRpc {
  if (!_rpc) {
    _rpc = createNearRpc({
      primaryUrl: FALLBACK_RPC_URLS[NETWORK],
      network: NETWORK,
      timeoutMs: 8_000,
      maxRetries: 2,
    })
  }
  return _rpc
}

// ---------------------------------------------------------------------------
// Contract view helper
// ---------------------------------------------------------------------------

/**
 * Call a view method on any NEAR contract via RPC.
 * Retries + failover handled by @onsocial/rpc.
 */
export async function viewContractAt<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  const rpc = getRpc()
  const res = await rpc.call<{ result?: number[] }>(
    'query',
    {
      request_type: 'call_function',
      finality: 'final',
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    },
  )

  const bytes = res.result?.result
  if (!bytes) return null
  const decoded = new TextDecoder().decode(new Uint8Array(bytes))
  return JSON.parse(decoded) as T
}

/**
 * Call a view method on the rewards contract via NEAR RPC.
 * Automatically retries + fails over through @onsocial/rpc.
 */
export async function viewContract<T>(
  method: string,
  args: Record<string, string>,
): Promise<T | null> {
  return viewContractAt<T>(REWARDS_CONTRACT, method, args)
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const SOCIAL_DECIMALS = 18

/** Convert yocto-SOCIAL (18 decimals) to human-readable string. */
export function yoctoToSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0'
  const padded = yocto.padStart(SOCIAL_DECIMALS + 1, '0')
  const whole = padded.slice(0, padded.length - SOCIAL_DECIMALS) || '0'
  const frac = padded.slice(padded.length - SOCIAL_DECIMALS).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/** Convert human-readable SOCIAL amount (e.g. "0.1") to yocto string. */
export function socialToYocto(input: string): string {
  const s = input.trim()
  if (!s || s === '0') return '0'

  const dotIdx = s.indexOf('.')
  let whole: string
  let frac: string

  if (dotIdx === -1) {
    whole = s
    frac = ''
  } else {
    whole = s.slice(0, dotIdx) || '0'
    frac = s.slice(dotIdx + 1)
  }

  const padded = frac.padEnd(SOCIAL_DECIMALS, '0').slice(0, SOCIAL_DECIMALS)
  const raw = whole + padded
  return raw.replace(/^0+/, '') || '0'
}

// ---------------------------------------------------------------------------
// On-chain types
// ---------------------------------------------------------------------------

export interface OnChainAppConfig {
  label: string
  reward_per_action: string
  daily_cap: string
  daily_budget: string
  daily_budget_spent: string
  budget_last_day: number
  total_budget: string
  total_credited: string
  authorized_callers: string[]
}

// ---------------------------------------------------------------------------
// Staking contract view types (match Rust ↔ JSON structs)
// ---------------------------------------------------------------------------

export interface StakingAccountView {
  locked_amount: string
  unlock_at: number
  lock_months: number
  effective_stake: string
  claimable_rewards: string
  stake_seconds: string
  rewards_claimed: string
}

export interface StakingStats {
  version: number
  token_id: string
  owner_id: string
  total_locked: string
  total_effective_stake: string
  total_stake_seconds: string
  total_rewards_released: string
  scheduled_pool: string
  infra_pool: string
  last_release_time: number
}

export interface StakingRewardRate {
  claimable_now: string
  rewards_per_second: string
  effective_stake: string
  total_effective_stake: string
  weekly_pool_release: string
}
