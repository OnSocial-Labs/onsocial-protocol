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

export const BOOST_CONTRACT =
  NETWORK === 'mainnet' ? 'boost.onsocial.near' : 'boost.onsocial.testnet';

export const TOKEN_CONTRACT =
  NETWORK === 'mainnet' ? 'token.onsocial.near' : 'token.onsocial.testnet';

export const VESTING_CONTRACT =
  NETWORK === 'mainnet'
    ? 'founder-vesting.onsocial.near'
    : 'founder-vesting.onsocial.testnet';

const DEFAULT_GOVERNANCE_PROPOSER_THRESHOLD = '100000000000000000000';
const NEAR_STORAGE_BYTE_COST = 10_000_000_000_000_000_000n;
const GOVERNANCE_DELEGATION_STORAGE_BYTES_OVERHEAD = 16n;

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

interface NearContractStateValue {
  key: string;
  value: string;
}

async function viewContractStateAt(
  contractId: string,
  prefix = 'STATE'
): Promise<NearContractStateValue[]> {
  const rpc = getRpc();
  const res = await rpc.call<{ values?: NearContractStateValue[] }>('query', {
    request_type: 'view_state',
    finality: 'final',
    account_id: contractId,
    prefix_base64: btoa(prefix),
  });

  return res.result?.values ?? [];
}

export interface NearAccountView {
  amount: string;
  code_hash: string;
  locked: string;
  storage_paid_at: number;
  storage_usage: number;
}

function getSpendableNearBalance(account: NearAccountView | null): string {
  if (!account) {
    return '0';
  }

  const storageReserve = BigInt(account.storage_usage) * NEAR_STORAGE_BYTE_COST;
  const totalAmount = BigInt(account.amount || '0');
  const lockedAmount = BigInt(account.locked || '0');

  return maxYocto(totalAmount - lockedAmount - storageReserve);
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

interface NearTransactionStatusOutcome {
  executor_id?: string;
  logs?: string[];
  status?: unknown;
}

interface NearTransactionStatusResponse {
  final_execution_status?: string;
  status?: unknown;
  receipts_outcome?: Array<{
    outcome?: NearTransactionStatusOutcome;
  }>;
  transaction?: {
    hash?: string;
    signer_id?: string;
  };
  transaction_outcome?: {
    id?: string;
  };
}

export type NearTransactionConfirmationResult = {
  ok: boolean;
  txHash: string;
  errorMessage?: string;
};

const NEAR_TX_POLL_INTERVAL_MS = 1_500;
const NEAR_TX_POLL_TIMEOUT_MS = 45_000;

export function extractNearTransactionHash(result: unknown): string | null {
  const outcome = result as NearTransactionStatusResponse;

  return outcome.transaction_outcome?.id ?? outcome.transaction?.hash ?? null;
}

export function extractNearTransactionHashes(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result.flatMap((item) => extractNearTransactionHashes(item));
  }

  const hash = extractNearTransactionHash(result);
  return hash ? [hash] : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function findFailure(value: unknown): unknown | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const failure = findFailure(item);
      if (failure) {
        return failure;
      }
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  if ('Failure' in value) {
    return (value as { Failure?: unknown }).Failure ?? null;
  }

  for (const nested of Object.values(value)) {
    const failure = findFailure(nested);
    if (failure) {
      return failure;
    }
  }

  return null;
}

function extractFailureMessage(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractFailureMessage(item);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const prioritizedKeys = ['ExecutionError', 'error_message', 'error', 'kind'];

  for (const key of prioritizedKeys) {
    if (key in value) {
      const message = extractFailureMessage(
        (value as Record<string, unknown>)[key]
      );
      if (message) {
        return message;
      }
    }
  }

  for (const nested of Object.values(value)) {
    const message = extractFailureMessage(nested);
    if (message) {
      return message;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'Transaction failed on-chain';
  }
}

async function getNearTransactionStatus(
  txHash: string,
  accountId: string
): Promise<NearTransactionStatusResponse | null> {
  const rpc = getRpc();
  const response = await rpc.call<NearTransactionStatusResponse>(
    'EXPERIMENTAL_tx_status',
    [txHash, accountId]
  );

  if (response.error) {
    const message =
      response.error.message ?? 'Failed to load transaction status';
    if (
      /unknown transaction|does not exist|transaction .* not found/i.test(
        message
      )
    ) {
      return null;
    }

    throw new Error(message);
  }

  return response.result ?? null;
}

export async function waitForNearTransactionConfirmation({
  txHash,
  accountId,
  timeoutMs = NEAR_TX_POLL_TIMEOUT_MS,
  pollIntervalMs = NEAR_TX_POLL_INTERVAL_MS,
}: {
  txHash: string;
  accountId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<NearTransactionConfirmationResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getNearTransactionStatus(txHash, accountId);

    if (!status) {
      await sleep(pollIntervalMs);
      continue;
    }

    const failure = extractFailureMessage(
      findFailure([status.status, status.receipts_outcome])
    );

    if (failure) {
      return {
        ok: false,
        txHash,
        errorMessage: failure,
      };
    }

    if (status.final_execution_status === 'FINAL') {
      return { ok: true, txHash };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Timed out waiting for on-chain confirmation');
}

export async function waitForNearTransactionBatchConfirmation({
  txHashes,
  accountId,
  timeoutMs = NEAR_TX_POLL_TIMEOUT_MS,
  pollIntervalMs = NEAR_TX_POLL_INTERVAL_MS,
}: {
  txHashes: string[];
  accountId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<NearTransactionConfirmationResult> {
  const uniqueHashes = [...new Set(txHashes.filter(Boolean))];

  if (uniqueHashes.length === 0) {
    return { ok: true, txHash: '' };
  }

  const results = await Promise.all(
    uniqueHashes.map((txHash) =>
      waitForNearTransactionConfirmation({
        txHash,
        accountId,
        timeoutMs,
        pollIntervalMs,
      })
    )
  );

  return (
    results.find((result) => !result.ok) ?? {
      ok: true,
      txHash: uniqueHashes[0],
    }
  );
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

async function tryViewContractStateAt(
  contractId: string,
  prefix = 'STATE'
): Promise<NearContractStateValue[]> {
  try {
    return await viewContractStateAt(contractId, prefix);
  } catch {
    return [];
  }
}

function decodeBase64Ascii(value: string): string {
  return atob(value);
}

function decodeBase64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(offset, true);
}

function readBorshString(
  bytes: Uint8Array,
  offset: number
): { value: string; offset: number } {
  const length = readU32LE(bytes, offset);
  const start = offset + 4;
  const end = start + length;
  return {
    value: new TextDecoder().decode(bytes.slice(start, end)),
    offset: end,
  };
}

function readBorshBytes(
  bytes: Uint8Array,
  offset: number
): { value: Uint8Array; offset: number } {
  const length = readU32LE(bytes, offset);
  const start = offset + 4;
  const end = start + length;
  return {
    value: bytes.slice(start, end),
    offset: end,
  };
}

function readU128LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;

  for (let index = 0; index < 16; index += 1) {
    value += BigInt(bytes[offset + index] ?? 0) << BigInt(index * 8);
  }

  return value;
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;

  for (let index = 0; index < 8; index += 1) {
    value += BigInt(bytes[offset + index] ?? 0) << BigInt(index * 8);
  }

  return value;
}

async function getGovernanceCooldownDurationNs(
  stakingContractId: string
): Promise<string | null> {
  const state = await tryViewContractStateAt(stakingContractId, 'STATE');
  const stateEntry = state.find(
    (entry) => decodeBase64Ascii(entry.key) === 'STATE'
  );

  if (!stateEntry) {
    return null;
  }

  try {
    const bytes = decodeBase64Bytes(stateEntry.value);
    let offset = 0;

    offset = readBorshString(bytes, offset).offset;
    offset = readBorshString(bytes, offset).offset;
    offset = readBorshBytes(bytes, offset).offset;
    offset += 16;

    return readU64LE(bytes, offset).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const SOCIAL_DECIMALS = 18;
const NEAR_DECIMALS = 24;

/** Convert yocto-SOCIAL (18 decimals) to human-readable string. */
export function yoctoToSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(SOCIAL_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - SOCIAL_DECIMALS) || '0';
  const frac = padded.slice(padded.length - SOCIAL_DECIMALS).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** Convert yocto-NEAR (24 decimals) to human-readable string. */
export function yoctoToNear(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(NEAR_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS) || '0';
  const frac = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '');
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

export interface RewardsAppConfigView {
  label: string;
  daily_cap: string;
  reward_per_action: string;
  authorized_callers: string[];
  active: boolean;
  total_budget: string;
  total_credited: string;
  daily_budget: string;
  daily_budget_spent: string;
  budget_last_day: number;
}

export interface RewardsUserRewardView {
  claimable: string;
  daily_earned: string;
  last_day: number;
  total_earned: string;
  total_claimed: string;
}

export interface RewardsUserAppRewardView {
  daily_earned: string;
  last_day: number;
  total_earned: string;
}

export interface RewardsUserAppRewardOverviewView {
  app_id: string;
  app_active: boolean;
  daily_earned: string;
  daily_remaining: string;
  total_earned: string;
}

export interface RewardsUserRewardsOverviewView {
  claimable: string;
  total_earned: string;
  total_claimed: string;
  global_daily_earned: string;
  global_daily_remaining: string;
  app?: RewardsUserAppRewardOverviewView | null;
}

// ---------------------------------------------------------------------------
// Boost contract view types (match Rust ↔ JSON structs)
// ---------------------------------------------------------------------------

export interface BoostAccountView {
  locked_amount: string;
  unlock_at: number;
  lock_months: number;
  effective_boost: string;
  claimable_rewards: string;
  boost_seconds: string;
  rewards_claimed: string;
}

export interface BoostStats {
  version: number;
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
}

export interface BoostRewardRate {
  claimable_now: string;
  rewards_per_second: string;
  effective_boost: string;
  total_effective_boost: string;
  weekly_pool_release: string;
  active_weekly_rate_bps: number;
}

export interface BoostLockStatus {
  is_locked: boolean;
  locked_amount: string;
  lock_months: number;
  unlock_at: number;
  can_unlock: boolean;
  time_remaining_ns: string;
  bonus_percent: number;
  effective_boost: string;
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
  proposal_bond?: string;
  roles?: GovernanceRole[];
}

interface GovernanceStorageBalance {
  total: string;
  available: string;
}

const GOVERNANCE_REGISTRATION_DEPOSIT_FLOOR = '50000000000000000000000';

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
  nearBalance: string;
  voteAmount: string;
  availableToDelegate: string;
  selfDelegatedWeight: string;
  selfDelegationEntries: string[];
  isRegistered: boolean;
  registrationStorageDeposit: string;
  delegationStorageCost: string;
  storageDeposit: string;
  storageAvailable: string;
  nearStorageNeeded: string;
  delegateActionStorageCost: string;
  delegateActionNearStorageNeeded: string;
  depositNeeded: string;
  delegateNeeded: string;
  nextActionTimestamp: string;
  cooldownDurationNs: string | null;
  isInCooldown: boolean;
  cooldownRemainingNs: string;
  availableToWithdraw: string;
  cooldownLockedAmount: string;
  canPropose: boolean;
}

function getDelegationStorageCost(accountId: string): string {
  const bytes =
    BigInt(accountId.length) + GOVERNANCE_DELEGATION_STORAGE_BYTES_OVERHEAD;
  return (bytes * NEAR_STORAGE_BYTE_COST).toString();
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

export async function getGovernanceProposalThreshold(
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<string> {
  const policy = await tryViewContractAt<GovernancePolicy>(
    daoAccountId,
    'get_policy'
  );

  return getGovernanceThreshold(policy);
}

export async function getGovernanceProposalBond(
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<string> {
  const policy = await tryViewContractAt<GovernancePolicy>(
    daoAccountId,
    'get_policy'
  );

  return policy?.proposal_bond ?? '0';
}

export async function getGovernanceEligibility(
  accountId: string,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<GovernanceEligibilitySnapshot> {
  const [
    policy,
    stakingContractId,
    delegatedWeight,
    walletBalance,
    nearAccount,
  ] = await Promise.all([
    tryViewContractAt<GovernancePolicy>(daoAccountId, 'get_policy'),
    tryViewContractAt<string>(daoAccountId, 'get_staking_contract'),
    tryViewContractAt<string>(daoAccountId, 'delegation_balance_of', {
      account_id: accountId,
    }),
    tryViewContractAt<string>(TOKEN_CONTRACT, 'ft_balance_of', {
      account_id: accountId,
    }),
    viewAccount(accountId),
  ]);

  const requiredWeight = getGovernanceThreshold(policy);
  const normalizedDelegatedWeight = delegatedWeight ?? '0';
  const normalizedWalletBalance = walletBalance ?? '0';
  const normalizedNearBalance = getSpendableNearBalance(nearAccount);
  const nowNs = BigInt(Date.now()) * 1_000_000n;

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
      nearBalance: normalizedNearBalance,
      voteAmount: '0',
      availableToDelegate: '0',
      selfDelegatedWeight: '0',
      selfDelegationEntries: [],
      isRegistered: false,
      registrationStorageDeposit: '0',
      delegationStorageCost: '0',
      storageDeposit: '0',
      storageAvailable: '0',
      nearStorageNeeded: '0',
      delegateActionStorageCost: '0',
      delegateActionNearStorageNeeded: '0',
      depositNeeded: remainingToThreshold,
      delegateNeeded: '0',
      nextActionTimestamp: '0',
      cooldownDurationNs: null,
      isInCooldown: false,
      cooldownRemainingNs: '0',
      availableToWithdraw: '0',
      cooldownLockedAmount: '0',
      canPropose: BigInt(normalizedDelegatedWeight) >= BigInt(requiredWeight),
    };
  }

  const [storageBalance, storageBounds, user, cooldownDurationNs] =
    await Promise.all([
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
      getGovernanceCooldownDurationNs(stakingContractId),
    ]);

  const isRegistered = !!storageBalance;
  const registrationStorageDeposit = (() => {
    const contractMin = BigInt(storageBounds?.min ?? '0');
    const floor = BigInt(GOVERNANCE_REGISTRATION_DEPOSIT_FLOOR);
    return (contractMin > floor ? contractMin : floor).toString();
  })();
  const storageAvailable = (() => {
    if (!isRegistered || !user) {
      return '0';
    }

    const storageCovered = BigInt(user.storage_used) * NEAR_STORAGE_BYTE_COST;
    return maxYocto(BigInt(user.near_amount ?? '0') - storageCovered);
  })();
  const voteAmount = user?.vote_amount ?? '0';
  const nextActionTimestamp = String(user?.next_action_timestamp ?? '0');
  const delegatedAmounts = user?.delegated_amounts ?? [];
  const totalDelegatedFromStaking = sumYocto(
    delegatedAmounts.map(([, amount]) => amount)
  );
  const selfDelegatedWeight = sumYocto(
    delegatedAmounts
      .filter(([delegateId]) => delegateId === accountId)
      .map(([, amount]) => amount)
  );
  const selfDelegationEntries = delegatedAmounts
    .filter(([delegateId]) => delegateId === accountId)
    .map(([, amount]) => amount);
  const availableToDelegate = maxYocto(
    BigInt(voteAmount) - BigInt(totalDelegatedFromStaking)
  );
  const cooldownEndsAt = BigInt(nextActionTimestamp || '0');
  const isInCooldown = cooldownEndsAt > nowNs;
  const cooldownRemainingNs = isInCooldown
    ? (cooldownEndsAt - nowNs).toString()
    : '0';
  const availableToWithdraw = isInCooldown ? '0' : availableToDelegate;
  const cooldownLockedAmount = isInCooldown ? availableToDelegate : '0';
  const remainingToThreshold = maxYocto(
    BigInt(requiredWeight) - BigInt(normalizedDelegatedWeight)
  );
  const depositNeeded = maxYocto(
    BigInt(remainingToThreshold) - BigInt(availableToDelegate)
  );
  const delegateNeeded = maxYocto(
    BigInt(remainingToThreshold) - BigInt(depositNeeded)
  );
  const delegationStorageCost =
    BigInt(delegateNeeded) > 0n
      ? BigInt(getDelegationStorageCost(accountId))
      : 0n;
  const additionalStorageNeeded = maxYocto(
    delegationStorageCost - BigInt(storageAvailable)
  );
  const storageDeposit = !isRegistered
    ? (
        BigInt(registrationStorageDeposit) + BigInt(additionalStorageNeeded)
      ).toString()
    : '0';
  const nearStorageNeeded = !isRegistered
    ? storageDeposit
    : additionalStorageNeeded;
  const delegateActionStorageCost = getDelegationStorageCost(accountId);
  const delegateActionAdditionalStorageNeeded = maxYocto(
    BigInt(delegateActionStorageCost) - BigInt(storageAvailable)
  );
  const delegateActionNearStorageNeeded = !isRegistered
    ? (
        BigInt(registrationStorageDeposit) +
        BigInt(delegateActionAdditionalStorageNeeded)
      ).toString()
    : delegateActionAdditionalStorageNeeded;

  return {
    daoAccountId,
    stakingContractId,
    requiredWeight,
    delegatedWeight: normalizedDelegatedWeight,
    remainingToThreshold,
    walletBalance: normalizedWalletBalance,
    nearBalance: normalizedNearBalance,
    voteAmount,
    availableToDelegate,
    selfDelegatedWeight,
    selfDelegationEntries,
    isRegistered,
    registrationStorageDeposit,
    delegationStorageCost: delegationStorageCost.toString(),
    storageDeposit,
    storageAvailable,
    nearStorageNeeded,
    delegateActionStorageCost,
    delegateActionNearStorageNeeded,
    depositNeeded,
    delegateNeeded,
    nextActionTimestamp,
    cooldownDurationNs,
    isInCooldown,
    cooldownRemainingNs,
    availableToWithdraw,
    cooldownLockedAmount,
    canPropose: BigInt(normalizedDelegatedWeight) >= BigInt(requiredWeight),
  };
}
