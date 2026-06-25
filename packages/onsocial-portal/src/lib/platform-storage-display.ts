import type {
  OnChainStorageBalance,
  PlatformAllowanceInfo,
} from '@onsocial/sdk';

/** Human-readable byte sizes for platform storage UI. */
export function formatCompactBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  // On-chain limits use decimal KB (see MIN_PLATFORM_*_BYTES = 6_000, 3_000).
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const isWhole = Math.abs(value - Math.round(value)) < 1e-9;
  const digits = unitIndex === 0 ? 0 : isWhole ? 0 : value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

/** Compact available/cap readout — e.g. 6/6 KB instead of 6 KB / 6 KB. */
export function formatPlatformBufferRatioLabel(
  availableBytes: number,
  maxBufferBytes: number
): string {
  const available = formatCompactBytes(availableBytes);
  const max = formatCompactBytes(maxBufferBytes);
  const availableMatch = available.match(/^([\d.]+)\s+(.+)$/);
  const maxMatch = max.match(/^([\d.]+)\s+(.+)$/);

  if (availableMatch && maxMatch && availableMatch[2] === maxMatch[2]) {
    return `${availableMatch[1]}/${maxMatch[1]} ${availableMatch[2]}`;
  }

  return `${available}/${max}`;
}

/** Screen-reader label — e.g. 6 KB of 6 KB buffer available. */
export function formatPlatformBufferRatioAriaLabel(
  availableBytes: number,
  maxBufferBytes: number
): string {
  const available = formatCompactBytes(availableBytes);
  const max = formatCompactBytes(maxBufferBytes);
  return `${available} of ${max} buffer available`;
}

export type PlatformStoragePhase = 'inactive' | 'active' | 'exhausted';

export interface PlatformStorageSummary {
  phase: PlatformStoragePhase;
  /** Bytes available to spend from the allowance buffer right now. */
  availableBytes: number;
  maxBufferBytes: number;
  /** Total bytes stored under platform sponsorship. */
  storedBytes: number;
  onboardingBytes: number;
  dailyRefillBytes: number;
  isPlatformSponsored: boolean;
  hasStarted: boolean;
  availablePercent: number;
}

const NANOS_PER_MINUTE = 60_000_000_000n;
const NANOS_PER_DAY = 86_400_000_000_000n;

/**
 * Platform allowance refills on-chain during writes, not on view calls.
 * Mirror contract math so idle users see accrued buffer in the UI.
 */
export function computeEffectivePlatformAllowance(
  storedAllowance: number,
  platformLastRefillNs: number,
  platformSponsored: boolean,
  dailyRefillBytes: number,
  maxBufferBytes: number,
  nowNs: bigint = BigInt(Date.now()) * 1_000_000n
): number {
  if (!platformSponsored || maxBufferBytes <= 0) {
    return storedAllowance;
  }

  const lastRefillNs = BigInt(platformLastRefillNs);
  if (lastRefillNs <= 0n) {
    return storedAllowance;
  }

  const elapsedNs = nowNs > lastRefillNs ? nowNs - lastRefillNs : 0n;
  if (elapsedNs < NANOS_PER_MINUTE) {
    return storedAllowance;
  }

  const refillBytes = (elapsedNs * BigInt(dailyRefillBytes)) / NANOS_PER_DAY;
  if (refillBytes <= 0n) {
    return storedAllowance;
  }

  const updated = BigInt(storedAllowance) + refillBytes;
  const capped =
    updated > BigInt(maxBufferBytes) ? BigInt(maxBufferBytes) : updated;
  return Number(capped);
}

export function buildPlatformStorageSummary(
  allowance: PlatformAllowanceInfo,
  balance: OnChainStorageBalance | null
): PlatformStorageSummary {
  const {
    current_allowance: rawAllowance,
    first_write_ns: firstWriteNs,
    is_platform_sponsored: isPlatformSponsored,
    config,
  } = allowance;

  const maxBufferBytes = config.max_allowance_bytes;
  const storedBytes = balance?.platform_pool_used_bytes ?? 0;
  const hasStarted = firstWriteNs != null;
  const sponsored = balance?.platform_sponsored ?? isPlatformSponsored;
  const storedAllowance = balance?.platform_allowance ?? rawAllowance;
  const availableBytes = computeEffectivePlatformAllowance(
    storedAllowance,
    balance?.platform_last_refill_ns ?? 0,
    sponsored,
    config.daily_refill_bytes,
    maxBufferBytes
  );
  let phase: PlatformStoragePhase = 'inactive';
  if (hasStarted && sponsored) {
    phase = availableBytes > 0 ? 'active' : 'exhausted';
  } else if (hasStarted && storedBytes > 0) {
    phase = 'exhausted';
  }

  return {
    phase,
    availableBytes,
    maxBufferBytes,
    storedBytes,
    onboardingBytes: config.onboarding_bytes,
    dailyRefillBytes: config.daily_refill_bytes,
    isPlatformSponsored: sponsored,
    hasStarted,
    availablePercent:
      maxBufferBytes > 0
        ? Math.min(100, Math.round((availableBytes / maxBufferBytes) * 100))
        : 0,
  };
}

export const PLATFORM_STORAGE_LABEL = 'Platform storage';

/** Wallet menu — short row label beside buffer bar. */
export const PLATFORM_STORAGE_MENU_LABEL = 'Buffer';

/** Short explainer — allowance is a refilling buffer, not a daily usage cap. */
export const PLATFORM_STORAGE_REFILL_HINT =
  'Refills continuously at the daily rate, up to the buffer cap.';

export const PLATFORM_STORAGE_INACTIVE_HINT =
  'Activates on your first OnSocial save when platform storage is available.';
