import type { OnChainStorageBalance } from '@onsocial/sdk';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto, yoctoToNear } from '@/lib/near-rpc';

/** Matches NEAR chain storage byte cost (10^19 yoctoNEAR per byte). */
const NEAR_STORAGE_BYTE_COST = 10_000_000_000_000_000_000n;

export const USER_STORAGE_LABEL = 'Your storage';

export const USER_STORAGE_DEPOSIT_HINT =
  'NEAR you deposit covers OnSocial writes when the platform buffer is empty.';

export const USER_STORAGE_WITHDRAW_HINT =
  'Withdraw unused NEAR — locked balance and active storage stay covered.';

export const USER_STORAGE_SHARE_HINT =
  'Bytes come from your share pool — recipients write under your allocation.';

export const STORAGE_DEPOSIT_PRESETS_NEAR = ['0.05', '0.1', '0.25'] as const;

/** Chain minimum per share_storage recipient (core-onsocial). */
export const MIN_SHARED_STORAGE_BYTES = 2_000;

export const MAX_STORAGE_SHARE_RECIPIENTS = 8;

export const STORAGE_SHARE_PERCENT_PRESETS = [25, 50, 75, 100] as const;

export function splitShareBytesPerRecipient(
  availableBytes: number,
  recipientCount: number,
  percent: number
): number {
  if (recipientCount <= 0 || availableBytes <= 0 || percent <= 0) {
    return 0;
  }

  const budget = Math.floor((availableBytes * percent) / 100);
  return Math.floor(budget / recipientCount);
}

/** Bytes still grantable from a funded pool — capped by physical room and unallocated caps. */
export function resolveSharePoolBudgetBytes(input: {
  availableBytes: number;
  sharedBytes: number;
  totalCapacityBytes: number;
}): number {
  const { availableBytes, sharedBytes, totalCapacityBytes } = input;
  const unallocatedCapBytes = Math.max(0, totalCapacityBytes - sharedBytes);
  return Math.min(Math.max(0, availableBytes), unallocatedCapBytes);
}

export function isValidShareBytesPerRecipient(bytes: number): boolean {
  return bytes >= MIN_SHARED_STORAGE_BYTES;
}

export interface ActiveStorageShareGrant {
  accountId: string;
  maxBytes: number;
  usedBytes: number;
}

export function shareGrantRemainingBytes(
  grant: ActiveStorageShareGrant
): number {
  return Math.max(0, grant.maxBytes - grant.usedBytes);
}

export function shareGrantUsedPercent(grant: ActiveStorageShareGrant): number {
  if (grant.maxBytes <= 0) return 0;
  return Math.min(100, Math.round((grant.usedBytes / grant.maxBytes) * 100));
}

export function pickActiveShareGrantsForPool(
  poolOwnerId: string,
  sponsorships: Array<{
    accountId: string;
    shared: { max_bytes: number; used_bytes: number; pool_id: string } | null;
  }>
): ActiveStorageShareGrant[] {
  return sponsorships
    .filter(
      (entry) => entry.shared != null && entry.shared.pool_id === poolOwnerId
    )
    .map((entry) => ({
      accountId: entry.accountId,
      maxBytes: entry.shared!.max_bytes,
      usedBytes: entry.shared!.used_bytes,
    }))
    .sort((left, right) => left.accountId.localeCompare(right.accountId));
}

export function uniqueShareGrantTargetIds(
  events: Array<{ targetId: string }>
): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];

  for (const event of events) {
    const targetId = event.targetId.trim();
    if (!targetId || seen.has(targetId)) continue;
    seen.add(targetId);
    targets.push(targetId);
  }

  return targets;
}

/** UI floor for deposits — chain accepts any positive yocto. */
export const STORAGE_DEPOSIT_MIN_NEAR = '0.001';

export const STORAGE_DEPOSIT_MIN_YOCTO = BigInt(
  nearToYocto(STORAGE_DEPOSIT_MIN_NEAR)
);

export const STORAGE_NEAR_INPUT_DECIMALS = 5;

export function formatStorageMinNearLabel(
  minYocto: bigint = STORAGE_DEPOSIT_MIN_YOCTO
): string {
  return yoctoToNear(minYocto.toString());
}

export function clampStorageNearAmountInput(
  input: string,
  opts: { maxYocto?: bigint | null } = {}
): string {
  const normalized = normalizeAmountInput(input, STORAGE_NEAR_INPUT_DECIMALS);
  if (!normalized || opts.maxYocto == null || opts.maxYocto <= 0n) {
    return normalized;
  }

  const finalized = finalizeAmountInput(
    normalized,
    STORAGE_NEAR_INPUT_DECIMALS
  );
  if (!finalized) return normalized;

  try {
    const yocto = BigInt(nearToYocto(finalized));
    if (yocto > opts.maxYocto) {
      return yoctoToNear(opts.maxYocto.toString());
    }
  } catch {
    return normalized;
  }

  return finalized;
}

export function parseStorageAmountYocto(
  input: string,
  mode: 'deposit' | 'withdraw',
  opts: { minYocto?: bigint; maxYocto?: bigint } = {}
): bigint {
  const finalized = finalizeAmountInput(input, STORAGE_NEAR_INPUT_DECIMALS);
  if (!finalized) {
    throw new Error('Enter an amount.');
  }

  let yocto: bigint;
  try {
    yocto = BigInt(nearToYocto(finalized));
  } catch {
    throw new Error('Invalid amount.');
  }

  if (mode === 'deposit') {
    const minYocto = opts.minYocto ?? STORAGE_DEPOSIT_MIN_YOCTO;
    if (yocto < minYocto) {
      throw new Error(
        `Minimum deposit is ${formatStorageMinNearLabel(minYocto)} NEAR.`
      );
    }
    if (opts.maxYocto != null && yocto > opts.maxYocto) {
      throw new Error('Insufficient NEAR wallet balance.');
    }
    return yocto;
  }

  const maxYocto = opts.maxYocto ?? 0n;
  if (yocto <= 0n) {
    if (maxYocto <= 0n) {
      throw new Error('Nothing available to withdraw.');
    }
    return 0n;
  }

  if (yocto > maxYocto) {
    throw new Error('Amount exceeds withdrawable storage balance.');
  }

  return yocto;
}

export function isValidStorageAmountInput(
  input: string,
  mode: 'deposit' | 'withdraw',
  opts: { minYocto?: bigint; maxYocto?: bigint | null } = {}
): boolean {
  try {
    parseStorageAmountYocto(input, mode, {
      minYocto: opts.minYocto,
      maxYocto: opts.maxYocto ?? undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export interface UserStorageSummary {
  registered: boolean;
  balanceYocto: bigint;
  lockedYocto: bigint;
  availableYocto: bigint;
  usedBytes: number;
  coveredBytes: number;
  effectiveBytes: number;
  /** NEAR deposit capacity at chain byte cost (available balance, excluding locked). */
  depositCapacityBytes: number;
  storageNeededYocto: bigint;
  withdrawableYocto: bigint;
  /** Share of deposit committed to active on-chain bytes (not platform-covered). */
  usagePercent: number;
  /** Share of deposit still withdrawable — mirrors platform “available buffer” semantics. */
  headroomPercent: number;
}

function maxYocto(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

function coveredBytes(balance: OnChainStorageBalance): number {
  const sponsorBytes = balance.shared_storage?.used_bytes ?? 0;
  return (
    sponsorBytes +
    balance.group_pool_used_bytes +
    balance.platform_pool_used_bytes
  );
}

function storageBytesFromYocto(yocto: bigint): number {
  if (yocto <= 0n) return 0;
  return Number(yocto / NEAR_STORAGE_BYTE_COST);
}

/** Bytes of on-chain storage capacity a NEAR deposit buys at chain byte cost. */
export function storageCapacityBytesFromYocto(yocto: bigint): number {
  return storageBytesFromYocto(yocto);
}

export function storageCapacityBytesFromNearInput(
  input: string,
  decimals: number = STORAGE_NEAR_INPUT_DECIMALS
): number | null {
  const finalized = finalizeAmountInput(input, decimals);
  if (!finalized) {
    return null;
  }

  try {
    const yocto = BigInt(nearToYocto(finalized));
    if (yocto <= 0n) {
      return null;
    }
    return storageBytesFromYocto(yocto);
  } catch {
    return null;
  }
}

/** Mirror core contract storage withdraw / coverage math. */
export function buildUserStorageSummary(
  balance: OnChainStorageBalance | null
): UserStorageSummary | null {
  if (!balance) {
    return null;
  }

  const balanceYocto = BigInt(balance.balance ?? '0');
  const lockedYocto = BigInt(balance.locked_balance ?? '0');
  const availableYocto = maxYocto(balanceYocto - lockedYocto);
  const covered = coveredBytes(balance);
  const effectiveBytes = Math.max(0, balance.used_bytes - covered);
  const storageNeededYocto = BigInt(effectiveBytes) * NEAR_STORAGE_BYTE_COST;
  const withdrawableYocto = maxYocto(availableYocto - storageNeededYocto);
  const usagePercent =
    balanceYocto > 0n
      ? Math.min(
          100,
          Math.round(Number((storageNeededYocto * 100n) / balanceYocto))
        )
      : 0;
  const headroomPercent =
    balanceYocto > 0n
      ? Math.min(
          100,
          Math.round(Number((withdrawableYocto * 100n) / balanceYocto))
        )
      : 0;
  const depositCapacityBytes = storageBytesFromYocto(availableYocto);

  return {
    registered: balanceYocto > 0n || balance.used_bytes > 0,
    balanceYocto,
    lockedYocto,
    availableYocto,
    usedBytes: balance.used_bytes,
    coveredBytes: covered,
    effectiveBytes,
    depositCapacityBytes,
    storageNeededYocto,
    withdrawableYocto,
    usagePercent,
    headroomPercent,
  };
}

export function storageManageIsHighlighted(
  summary: {
    phase: 'inactive' | 'active' | 'exhausted';
    availablePercent: number;
  } | null
): boolean {
  if (!summary) return false;
  if (summary.phase === 'inactive' || summary.phase === 'exhausted') {
    return true;
  }
  return summary.availablePercent <= 25;
}
