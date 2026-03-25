// Shared NEAR RPC client for portal pages — wraps @onsocial/rpc with retry,
// failover, and circuit breaker. Browser-safe (native fetch, zero Node.js deps).

import {
  createNearRpc,
  FALLBACK_RPC_URLS,
  type NearRpc,
  type Network,
} from '@onsocial/rpc';
import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NETWORK: Network = ACTIVE_NEAR_NETWORK;

export const REWARDS_CONTRACT =
  NETWORK === 'mainnet' ? 'rewards.onsocial.near' : 'rewards.onsocial.testnet';

export const CORE_CONTRACT =
  NETWORK === 'mainnet' ? 'core.onsocial.near' : 'core.onsocial.testnet';

export const SCARCES_CONTRACT =
  NETWORK === 'mainnet' ? 'scarces.onsocial.near' : 'scarces.onsocial.testnet';

export const STAKING_CONTRACT =
  NETWORK === 'mainnet' ? 'staking.onsocial.near' : 'staking.onsocial.testnet';

export const TOKEN_CONTRACT =
  NETWORK === 'mainnet' ? 'token.onsocial.near' : 'token.onsocial.testnet';

export const VESTING_CONTRACT =
  NETWORK === 'mainnet'
    ? 'founder-vesting.onsocial.near'
    : 'founder-vesting.onsocial.testnet';

const DEFAULT_GOVERNANCE_PROPOSER_THRESHOLD = '100000000000000000000';

// ---------------------------------------------------------------------------
// Singleton — circuit breaker state persists across renders
// ---------------------------------------------------------------------------

let _rpc: NearRpc | null = null;
const _rpcsByNetwork: Partial<Record<Network, NearRpc>> = {};

function getRpc(): NearRpc {
  if (!_rpc) {
    _rpc = createNearRpc({
      primaryUrl: FALLBACK_RPC_URLS[NETWORK],
      network: NETWORK,
      timeoutMs: 8_000,
      maxRetries: 2,
    });
  }
  return _rpc;
}

function getRpcForNetwork(network: Network): NearRpc {
  if (network === NETWORK) {
    return getRpc();
  }

  const existing = _rpcsByNetwork[network];
  if (existing) {
    return existing;
  }

  const rpc = createNearRpc({
    primaryUrl: FALLBACK_RPC_URLS[network],
    network,
    timeoutMs: 8_000,
    maxRetries: 2,
  });

  _rpcsByNetwork[network] = rpc;
  return rpc;
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
  args: Record<string, unknown> = {}
): Promise<T | null> {
  const rpc = getRpc();
  const res = await rpc.call<{ result?: number[] }>('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });

  const bytes = res.result?.result;
  if (!bytes) return null;
  const decoded = new TextDecoder().decode(new Uint8Array(bytes));
  return JSON.parse(decoded) as T;
}

export async function viewContractAtOnNetwork<T>(
  network: Network,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {}
): Promise<T | null> {
  const rpc = getRpcForNetwork(network);
  const res = await rpc.call<{ result?: number[] }>('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });

  const bytes = res.result?.result;
  if (!bytes) return null;
  const decoded = new TextDecoder().decode(new Uint8Array(bytes));
  return JSON.parse(decoded) as T;
}

export interface NearAccountView {
  amount: string;
  code_hash: string;
  locked: string;
  storage_paid_at: number;
  storage_usage: number;
}

export async function viewAccount(
  accountId: string
): Promise<NearAccountView | null> {
  const rpc = getRpc();
  const res = await rpc.call<NearAccountView>('query', {
    request_type: 'view_account',
    finality: 'final',
    account_id: accountId,
  });
  return res.result ?? null;
}

/**
 * Call a view method on the rewards contract via NEAR RPC.
 * Automatically retries + fails over through @onsocial/rpc.
 */
export async function viewContract<T>(
  method: string,
  args: Record<string, string>
): Promise<T | null> {
  return viewContractAt<T>(REWARDS_CONTRACT, method, args);
}

async function tryViewContractAt<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {}
): Promise<T | null> {
  try {
    return await viewContractAt<T>(contractId, method, args);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const SOCIAL_DECIMALS = 18;

/** Convert yocto-SOCIAL (18 decimals) to human-readable string. */
export function yoctoToSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(SOCIAL_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - SOCIAL_DECIMALS) || '0';
  const frac = padded.slice(padded.length - SOCIAL_DECIMALS).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** Convert human-readable SOCIAL amount (e.g. "0.1") to yocto string. */
export function socialToYocto(input: string): string {
  const s = input.trim();
  if (!s || s === '0') return '0';

  const dotIdx = s.indexOf('.');
  let whole: string;
  let frac: string;

  if (dotIdx === -1) {
    whole = s;
    frac = '';
  } else {
    whole = s.slice(0, dotIdx) || '0';
    frac = s.slice(dotIdx + 1);
  }

  const padded = frac.padEnd(SOCIAL_DECIMALS, '0').slice(0, SOCIAL_DECIMALS);
  const raw = whole + padded;
  return raw.replace(/^0+/, '') || '0';
}

function sumYocto(values: string[]): string {
  return values.reduce((total, value) => {
    return (BigInt(total) + BigInt(value || '0')).toString();
  }, '0');
}

function maxYocto(value: bigint): string {
  return (value > 0n ? value : 0n).toString();
}

// ---------------------------------------------------------------------------
// On-chain types
// ---------------------------------------------------------------------------

export interface OnChainAppConfig {
  label: string;
  reward_per_action: string;
  daily_cap: string;
  daily_budget: string;
  daily_budget_spent: string;
  budget_last_day: number;
  total_budget: string;
  total_credited: string;
  authorized_callers: string[];
}

// ---------------------------------------------------------------------------
// Staking contract view types (match Rust ↔ JSON structs)
// ---------------------------------------------------------------------------

export interface StakingAccountView {
  locked_amount: string;
  unlock_at: number;
  lock_months: number;
  effective_stake: string;
  claimable_rewards: string;
  stake_seconds: string;
  rewards_claimed: string;
}

export interface StakingStats {
  version: number;
  token_id: string;
  owner_id: string;
  total_locked: string;
  total_effective_stake: string;
  total_stake_seconds: string;
  total_rewards_released: string;
  scheduled_pool: string;
  infra_pool: string;
  last_release_time: number;
}

export interface StakingRewardRate {
  claimable_now: string;
  rewards_per_second: string;
  effective_stake: string;
  total_effective_stake: string;
  weekly_pool_release: string;
}

export interface StakingLockStatus {
  is_locked: boolean;
  locked_amount: string;
  lock_months: number;
  unlock_at: number;
  can_unlock: boolean;
  time_remaining_ns: string;
  bonus_percent: number;
  effective_stake: string;
  lock_expired: boolean;
}

interface GovernanceRole {
  name?: string;
  kind?: {
    Group?: string[];
    Member?: string;
  };
  permissions?: string[];
}

interface GovernancePolicy {
  roles?: GovernanceRole[];
}

interface GovernanceStorageBalance {
  total: string;
  available: string;
}

export interface GovernanceStakingUser {
  storage_used: number;
  near_amount: string;
  vote_amount: string;
  next_action_timestamp: string | number;
  delegated_amounts: Array<[string, string]>;
}

export interface GovernanceEligibilitySnapshot {
  daoAccountId: string;
  stakingContractId: string | null;
  requiredWeight: string;
  delegatedWeight: string;
  remainingToThreshold: string;
  walletBalance: string;
  voteAmount: string;
  availableToDelegate: string;
  selfDelegatedWeight: string;
  isRegistered: boolean;
  storageDeposit: string;
  depositNeeded: string;
  delegateNeeded: string;
  canPropose: boolean;
}

function getGovernanceThreshold(policy: GovernancePolicy | null): string {
  const proposerRole = policy?.roles?.find((role) => {
    if (role.name === 'partner_proposers') {
      return true;
    }

    return role.permissions?.includes('call:AddProposal') ?? false;
  });

  return proposerRole?.kind?.Member ?? DEFAULT_GOVERNANCE_PROPOSER_THRESHOLD;
}

export async function getGovernanceEligibility(
  accountId: string,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceEligibilitySnapshot> {
  const [policy, stakingContractId, delegatedWeight, walletBalance] =
    await Promise.all([
      tryViewContractAt<GovernancePolicy>(daoAccountId, 'get_policy'),
      tryViewContractAt<string>(daoAccountId, 'get_staking_contract'),
      tryViewContractAt<string>(daoAccountId, 'delegation_balance_of', {
        account_id: accountId,
      }),
      tryViewContractAt<string>(TOKEN_CONTRACT, 'ft_balance_of', {
        account_id: accountId,
      }),
    ]);

  const requiredWeight = getGovernanceThreshold(policy);
  const normalizedDelegatedWeight = delegatedWeight ?? '0';
  const normalizedWalletBalance = walletBalance ?? '0';

  if (!stakingContractId) {
    const remainingToThreshold = maxYocto(
      BigInt(requiredWeight) - BigInt(normalizedDelegatedWeight)
    );

    return {
      daoAccountId,
      stakingContractId: null,
      requiredWeight,
      delegatedWeight: normalizedDelegatedWeight,
      remainingToThreshold,
      walletBalance: normalizedWalletBalance,
      voteAmount: '0',
      availableToDelegate: '0',
      selfDelegatedWeight: '0',
      isRegistered: false,
      storageDeposit: '0',
      depositNeeded: remainingToThreshold,
      delegateNeeded: '0',
      canPropose: BigInt(normalizedDelegatedWeight) >= BigInt(requiredWeight),
    };
  }

  const [storageBalance, storageBounds, user] = await Promise.all([
    tryViewContractAt<GovernanceStorageBalance>(
      stakingContractId,
      'storage_balance_of',
      { account_id: accountId }
    ),
    tryViewContractAt<{ min: string }>(
      stakingContractId,
      'storage_balance_bounds'
    ),
    tryViewContractAt<GovernanceStakingUser>(stakingContractId, 'get_user', {
      account_id: accountId,
    }),
  ]);

  const isRegistered = !!storageBalance;
  const voteAmount = user?.vote_amount ?? '0';
  const delegatedAmounts = user?.delegated_amounts ?? [];
  const totalDelegatedFromStaking = sumYocto(
    delegatedAmounts.map(([, amount]) => amount)
  );
  const selfDelegatedWeight = sumYocto(
    delegatedAmounts
      .filter(([delegateId]) => delegateId === accountId)
      .map(([, amount]) => amount)
  );
  const availableToDelegate = maxYocto(
    BigInt(voteAmount) - BigInt(totalDelegatedFromStaking)
  );
  const remainingToThreshold = maxYocto(
    BigInt(requiredWeight) - BigInt(normalizedDelegatedWeight)
  );
  const depositNeeded = maxYocto(
    BigInt(remainingToThreshold) - BigInt(availableToDelegate)
  );
  const delegateNeeded = maxYocto(
    BigInt(remainingToThreshold) - BigInt(depositNeeded)
  );

  return {
    daoAccountId,
    stakingContractId,
    requiredWeight,
    delegatedWeight: normalizedDelegatedWeight,
    remainingToThreshold,
    walletBalance: normalizedWalletBalance,
    voteAmount,
    availableToDelegate,
    selfDelegatedWeight,
    isRegistered,
    storageDeposit: storageBounds?.min ?? '0',
    depositNeeded,
    delegateNeeded,
    canPropose: BigInt(normalizedDelegatedWeight) >= BigInt(requiredWeight),
  };
}
