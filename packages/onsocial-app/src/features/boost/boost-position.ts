// Boost position — reads, contract constants, and yocto math for the
// portfolio boost sheet. Lock periods / minimums mirror the boost contract
// (contracts/boost-onsocial); writes live in portfolio-boost-sheet.tsx.

import type {
  BoostAccountView,
  BoostLockStatus,
  BoostRewardsLiveSnapshot,
} from '@onsocial/sdk';
import type { BoostLockPeriod } from '@onsocial/sdk/advanced';
import { BROWSER_GATEWAY_PROXY } from '@/lib/app-gateway-url';

export interface BoostLockPeriodOption {
  months: BoostLockPeriod;
  bonusPercent: number;
  short: string;
  label: string;
}

/** Matches `VALID_LOCK_PERIODS` and the bonus table in the boost contract. */
export const BOOST_LOCK_PERIOD_OPTIONS: BoostLockPeriodOption[] = [
  { months: 1, bonusPercent: 5, short: '1mo', label: '1 month' },
  { months: 6, bonusPercent: 10, short: '6mo', label: '6 months' },
  { months: 12, bonusPercent: 20, short: '12mo', label: '12 months' },
  { months: 24, bonusPercent: 35, short: '24mo', label: '24 months' },
  { months: 48, bonusPercent: 50, short: '48mo', label: '48 months' },
];

export const BOOST_DEFAULT_LOCK_MONTHS: BoostLockPeriod = 12;

/** Contract `MIN_BOOST_LOCK` (0.01 SOCIAL). */
export const BOOST_MIN_LOCK_YOCTO = 10_000_000_000_000_000n;
export const BOOST_MIN_LOCK_SOCIAL_LABEL = '0.01';

/** Collect disabled below this threshold (same dust floor as the portal). */
export const BOOST_CLAIM_DUST_YOCTO = 100_000_000_000_000_000n;

/** Gas for `ft_transfer_call` lock and `claim_rewards` / `unlock`. */
export const BOOST_LOCK_GAS = '80000000000000';
export const BOOST_CLAIM_GAS = '80000000000000';
export const BOOST_UNLOCK_GAS = '80000000000000';
/** Gas for `renew_lock` / `extend_lock`. */
export const BOOST_ADJUST_GAS = '30000000000000';

const SOCIAL_DECIMALS = 18;
const YOCTO_PER_SOCIAL = 10n ** BigInt(SOCIAL_DECIMALS);

export function parseYoctoOrZero(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function lockPeriodOption(months: number): BoostLockPeriodOption | null {
  const normalized = Number(months);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return (
    BOOST_LOCK_PERIOD_OPTIONS.find((option) => option.months === normalized) ??
    null
  );
}

/** Map on-chain bonus_percent back to the canonical lock period. */
export function lockMonthsFromBonusPercent(
  bonusPercent: number | null | undefined
): number | null {
  const bonus = Number(bonusPercent);
  switch (bonus) {
    case 5:
      return 1;
    case 10:
      return 6;
    case 20:
      return 12;
    case 35:
      return 24;
    case 50:
      return 48;
    default:
      return null;
  }
}

/**
 * Resolve the active commitment length from every signal we have.
 * Takes the max positive value so a sparse `0` on one view can never
 * under-report and let Extend offer the current period again.
 */
export function resolveCurrentLockMonths(
  account: { lock_months?: number | null } | null | undefined,
  lockStatus?: {
    lock_months?: number | null;
    bonus_percent?: number | null;
  } | null
): number {
  const candidates = [
    Number(account?.lock_months),
    Number(lockStatus?.lock_months),
    lockMonthsFromBonusPercent(lockStatus?.bonus_percent) ?? NaN,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

/** Periods strictly longer than the current lock — Extend never offers same/shorter. */
export function longerLockPeriodOptions(
  currentMonths: number | null | undefined
): BoostLockPeriodOption[] {
  const normalized = Number(currentMonths);
  if (!Number.isFinite(normalized) || normalized <= 0) return [];
  return BOOST_LOCK_PERIOD_OPTIONS.filter(
    (option) => option.months > normalized
  );
}

/** Guard for Extend clicks — same/shorter periods are renew, not extend. */
export function isLongerLockPeriod(
  months: number,
  currentMonths: number
): boolean {
  return (
    Number.isFinite(months) &&
    Number.isFinite(currentMonths) &&
    currentMonths > 0 &&
    months > currentMonths
  );
}

/** Influence preview — locked amount plus the period bonus. */
export function applyLockBonus(
  amountYocto: bigint,
  bonusPercent: number
): bigint {
  return (amountYocto * BigInt(100 + bonusPercent)) / 100n;
}

/** Fixed-fraction yocto display for the live collect counter. */
export function formatYoctoSocialFixed(
  value: bigint,
  fractionDigits: number
): string {
  const digits = Math.max(0, Math.min(SOCIAL_DECIMALS, fractionDigits));
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = (absolute / YOCTO_PER_SOCIAL).toLocaleString('en-US');

  if (digits === 0) {
    return `${sign}${whole}`;
  }

  const fractionDivisor = 10n ** BigInt(SOCIAL_DECIMALS - digits);
  const fraction = ((absolute % YOCTO_PER_SOCIAL) / fractionDivisor)
    .toString()
    .padStart(digits, '0');

  return `${sign}${whole}.${fraction}`;
}

/**
 * Split whole / fraction so the integer part (and the SOCIAL suffix) stays
 * visually steady while the fraction digits tick — same trick as the portal
 * live counter.
 */
export function formatYoctoSocialParts(
  value: bigint,
  fractionDigits: number
): { whole: string; fraction: string; full: string } {
  const full = formatYoctoSocialFixed(value, fractionDigits);
  if (fractionDigits === 0) {
    return { whole: full, fraction: '', full };
  }

  const dotIndex = full.indexOf('.');
  if (dotIndex === -1) {
    const fraction = '0'.repeat(fractionDigits);
    return { whole: full, fraction, full: `${full}.${fraction}` };
  }

  return {
    whole: full.slice(0, dotIndex),
    fraction: full.slice(dotIndex + 1),
    full,
  };
}

/** Drop dust claimable when the rate is zero (same floor as the portal). */
export function normalizeBoostClaimableYocto(
  claimableYocto: bigint,
  rewardsPerSecondYocto: bigint
): bigint {
  if (
    rewardsPerSecondYocto === 0n &&
    claimableYocto > 0n &&
    claimableYocto < BOOST_CLAIM_DUST_YOCTO
  ) {
    return 0n;
  }
  return claimableYocto;
}

/**
 * Project claimable rewards forward from the chain snapshot timestamp.
 * Used once when anchoring; ticks use {@link extrapolateFromClientAnchor}.
 */
export function extrapolateClaimableYocto(
  snapshot: BoostRewardsLiveSnapshot,
  atMs: number
): bigint {
  const perSecondYocto = parseYoctoOrZero(snapshot.rewards_per_second);
  const anchorYocto = normalizeBoostClaimableYocto(
    parseYoctoOrZero(snapshot.claimable_rewards),
    perSecondYocto
  );
  if (perSecondYocto <= 0n) {
    return anchorYocto;
  }

  const asOfNs = BigInt(snapshot.as_of_timestamp_ns);
  const atNs = BigInt(atMs) * 1_000_000n;
  const elapsedNs = atNs > asOfNs ? atNs - asOfNs : 0n;
  return anchorYocto + (perSecondYocto * elapsedNs) / 1_000_000_000n;
}

export type BoostLiveCounterAnchor = {
  baseYocto: bigint;
  clientMs: number;
  ratePerSecondYocto: bigint;
};

/**
 * Client-side accrual from a wall-clock anchor — avoids block-timestamp vs
 * wall-clock jitter when the gateway resyncs (portal pattern).
 */
export function extrapolateFromClientAnchor(
  anchor: BoostLiveCounterAnchor,
  atMs = Date.now()
): bigint {
  const elapsedMs = Math.max(0, atMs - anchor.clientMs);
  if (anchor.ratePerSecondYocto <= 0n || elapsedMs === 0) {
    return anchor.baseYocto;
  }
  return (
    anchor.baseYocto + (anchor.ratePerSecondYocto * BigInt(elapsedMs)) / 1000n
  );
}

export function formatUnlockDateLabel(unlockAtNs: number): string {
  const ms = Math.floor(unlockAtNs / 1_000_000);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function previewUnlockDateLabel(months: number): string {
  const unlockDate = new Date();
  unlockDate.setMonth(unlockDate.getMonth() + months);
  return unlockDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTimeRemainingLabel(unlockAtNs: number): string {
  const remainingNs = unlockAtNs - Date.now() * 1_000_000;
  if (remainingNs <= 0) return 'Complete';

  const totalSec = Math.floor(remainingNs / 1_000_000_000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);

  if (days > 30) {
    const months = Math.floor(days / 30);
    return `${months}mo ${days % 30}d left`;
  }
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// ── Reads (boost contract views via the OnAPI gateway proxy) ──

async function fetchBoostView<T>(path: string, accountId: string): Promise<T> {
  const search = new URLSearchParams({ accountId });
  const response = await fetch(
    `${BROWSER_GATEWAY_PROXY}/${path}?${search.toString()}`,
    { cache: 'no-store' }
  );
  if (!response.ok) {
    throw new Error(`Boost read failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function fetchBoostAccount(
  accountId: string
): Promise<BoostAccountView> {
  return fetchBoostView<BoostAccountView>('data/boost-account', accountId);
}

export function fetchBoostLockStatus(
  accountId: string
): Promise<BoostLockStatus> {
  return fetchBoostView<BoostLockStatus>('data/boost-lock-status', accountId);
}

export function fetchBoostRewardsLiveSnapshot(
  accountId: string
): Promise<BoostRewardsLiveSnapshot> {
  return fetchBoostView<BoostRewardsLiveSnapshot>(
    'data/boost-rewards-live',
    accountId
  );
}

/** SOCIAL wallet balance for the commit / increase amount field. */
export async function fetchWalletSocialBalanceYocto(
  accountId: string
): Promise<bigint> {
  const response = await fetch(
    `/api/token/balance?accountId=${encodeURIComponent(accountId)}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as {
    balanceYocto?: string;
  } | null;
  if (!response.ok || !body?.balanceYocto) {
    throw new Error('Could not load SOCIAL balance.');
  }
  return parseYoctoOrZero(body.balanceYocto);
}
