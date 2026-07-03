import type { OnChainStorageBalance } from '@onsocial/sdk';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';

/** Matches NEAR chain storage byte cost (10^19 yoctoNEAR per byte). */
const NEAR_STORAGE_BYTE_COST = 10_000_000_000_000_000_000n;

export const USER_STORAGE_LABEL = 'Your storage';

export const USER_STORAGE_DEPOSIT_HINT =
  'NEAR you deposit covers OnSocial writes when the platform buffer is empty.';

export const USER_STORAGE_WITHDRAW_HINT =
  'Withdraw unused NEAR — locked balance and active storage stay covered.';

export const STORAGE_DEPOSIT_PRESETS_NEAR = ['0.05', '0.1', '0.25'] as const;

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
  depositCapacityBytes: number;
  storageNeededYocto: bigint;
  withdrawableYocto: bigint;
  usagePercent: number;
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

/** Highlight Manage when buffer needs attention — used by wallet strip + storage sheet. */
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

/**
 * Whether to promote storage in list-style surfaces (not the account drawer wallet
 * card — that always shows the buffer bar for ambient usage awareness).
 */
export function shouldShowAccountStorageStrip(
  summary: {
    phase: 'inactive' | 'active' | 'exhausted';
    availablePercent: number;
  } | null,
  loading: boolean,
  error: string | null
): boolean {
  if (loading || error || !summary) {
    return true;
  }

  if (summary.phase !== 'active') {
    return true;
  }

  return summary.availablePercent <= 25;
}
