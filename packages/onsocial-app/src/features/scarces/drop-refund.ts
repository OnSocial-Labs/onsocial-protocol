import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';

/** Contract default claim window (90 days). */
export const DEFAULT_REFUND_CLAIM_DAYS = 90;

/** Contract minimum claim window (7 days). */
export const MIN_REFUND_CLAIM_DAYS = 7;

const NS_PER_DAY = 24 * 60 * 60 * 1_000_000_000;

/** Eligible tickets for the refund pool: minted minus fully redeemed. */
export function refundableTokenCount(
  minted: number,
  fullyRedeemed: number
): number {
  const m = Math.max(0, Math.floor(minted));
  const f = Math.max(0, Math.floor(fullyRedeemed));
  return Math.max(0, m - f);
}

/** Duration for `refund_deadline_ns` (days → nanoseconds). */
export function refundClaimDaysToNs(days: number): number {
  const d = Math.max(MIN_REFUND_CLAIM_DAYS, Math.floor(days));
  return d * NS_PER_DAY;
}

/**
 * Exact deposit to fund the pool: refundPerToken × refundableCount.
 * Returns `'0'` when nothing is refundable (cancel still attaches 1 yocto via confirmation).
 */
export function refundPoolDepositYocto(
  refundPerTokenNear: string,
  refundableCount: number
): string {
  const count = Math.max(0, Math.floor(refundableCount));
  if (count === 0) return '0';
  const per = BigInt(nearToYocto(refundPerTokenNear.trim() || '0'));
  return (per * BigInt(count)).toString();
}

/** Human total for the cancel confirm sheet. */
export function refundPoolDepositNearLabel(
  refundPerTokenNear: string,
  refundableCount: number
): string {
  const yocto = refundPoolDepositYocto(refundPerTokenNear, refundableCount);
  if (yocto === '0') return '0';
  const near = yoctoToNear(yocto);
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** True when the claim window has ended (for withdraw). */
export function isRefundClaimWindowClosed(
  refundDeadlineMs: number | null | undefined,
  nowMs = Date.now()
): boolean {
  if (refundDeadlineMs == null || !Number.isFinite(refundDeadlineMs)) {
    return false;
  }
  return nowMs >= refundDeadlineMs;
}

/** True when the pool still has NEAR to reclaim after the window. */
export function hasUnclaimedRefundPool(
  refundPoolYocto: string | null | undefined
): boolean {
  const raw = (refundPoolYocto ?? '0').trim();
  if (!/^\d+$/.test(raw)) return false;
  try {
    return BigInt(raw) > 0n;
  } catch {
    return false;
  }
}
