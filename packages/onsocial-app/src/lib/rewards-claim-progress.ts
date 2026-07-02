import { formatSocialCompact } from '@/lib/format-social-balance';
import { APP_REWARD_MIN_CLAIM_YOCTO } from '@/lib/app-reward-constants';

export function claimProgressPercent(claimableYocto: bigint): number {
  if (APP_REWARD_MIN_CLAIM_YOCTO <= 0n) {
    return 0;
  }
  const ratio =
    Number(claimableYocto) / Number(APP_REWARD_MIN_CLAIM_YOCTO);
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

export function formatClaimRatioLabel(
  claimableYocto: bigint,
  minYocto: bigint = APP_REWARD_MIN_CLAIM_YOCTO
): string {
  const current = formatSocialCompact(claimableYocto);
  let min = formatSocialCompact(minYocto);
  if (min.endsWith('.00')) {
    min = min.slice(0, -3);
  }
  return `${current} / ${min}`;
}
