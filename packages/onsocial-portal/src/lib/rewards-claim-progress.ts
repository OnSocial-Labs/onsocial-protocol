import { formatSocialCompact } from '@/lib/leaderboard';
import { PORTAL_REWARD_MIN_CLAIM_YOCTO } from '@/lib/portal-reward-constants';

export function claimProgressPercent(claimableYocto: bigint): number {
  if (PORTAL_REWARD_MIN_CLAIM_YOCTO <= 0n) return 0;
  const ratio = Number(claimableYocto) / Number(PORTAL_REWARD_MIN_CLAIM_YOCTO);
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

/** Compact ratio label, e.g. `0.10 / 1` for claim progress. */
export function formatClaimRatioLabel(
  claimableYocto: bigint,
  minYocto: bigint
): string {
  const current = formatSocialCompact(claimableYocto.toString());
  let min = formatSocialCompact(minYocto.toString());
  if (min.endsWith('.00')) min = min.slice(0, -3);
  return `${current} / ${min}`;
}
