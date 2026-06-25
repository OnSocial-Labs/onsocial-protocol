'use client';

import { formatSocialCompact } from '@/lib/leaderboard';
import { PORTAL_REWARD_MIN_CLAIM_YOCTO } from '@/lib/portal-reward-constants';
import {
  walletMenuMetricRowClass,
  walletMenuMetricRatioSlotClass,
  walletMenuProgressTrackSlotClass,
} from '@/components/ui/floating-panel';
import { RewardsClaimButton } from '@/components/rewards-claim-button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  claimProgressPercent,
  formatClaimRatioLabel,
} from '@/lib/rewards-claim-progress';

export interface RewardsClaimMetricRowProps {
  claimableYocto: bigint;
  canClaim: boolean;
  claiming: boolean;
  loading?: boolean;
  disabled?: boolean;
  remainingToClaimYocto?: bigint;
  onClaim: () => void | Promise<void>;
  /** Wallet menu metric tokens (mobile micro, md caption). */
  compact?: boolean;
}

function ClaimProgressSkeleton() {
  return (
    <>
      <div className={walletMenuProgressTrackSlotClass} aria-hidden>
        <Skeleton className="h-1 w-full rounded-full bg-foreground/[0.06]" />
      </div>
      <Skeleton
        className={cn(
          walletMenuMetricRatioSlotClass,
          'h-3 rounded bg-foreground/[0.06]'
        )}
        aria-hidden
      />
    </>
  );
}

/** Wallet-style claim row: bar + ratio counter + Claim pill (shared by wallet menu and rules modal). */
export function RewardsClaimMetricRow({
  claimableYocto,
  canClaim,
  claiming,
  loading = false,
  disabled = false,
  remainingToClaimYocto = 0n,
  onClaim,
  compact = true,
}: RewardsClaimMetricRowProps) {
  const ratioLabel = formatClaimRatioLabel(
    claimableYocto,
    PORTAL_REWARD_MIN_CLAIM_YOCTO
  );
  const remainingLabel = formatSocialCompact(remainingToClaimYocto.toString());
  const progress = claimProgressPercent(claimableYocto);
  const barFill = claimableYocto > 0n ? Math.max(progress, 3) : 0;
  const showClaimGlow = canClaim && barFill > 0;

  const metricRowClass = compact
    ? walletMenuMetricRowClass
    : 'flex min-h-6 items-center gap-1.5 md:gap-2';

  const trackClass = cn(
    walletMenuProgressTrackSlotClass,
    !compact && 'min-h-[1.25rem] md:min-h-[1.75rem]'
  );

  const ratioClass = cn(
    compact
      ? walletMenuMetricRatioSlotClass
      : 'shrink-0 font-mono portal-type-caption font-medium tabular-nums leading-none',
    canClaim ? 'text-[var(--portal-green)]' : 'text-muted-foreground/50'
  );

  const claimButton = (
    <RewardsClaimButton
      canClaim={canClaim}
      claiming={claiming}
      appearance="inline"
      compact={compact}
      disabled={disabled || loading}
      ariaLabel={
        canClaim
          ? `Claim ${ratioLabel} SOCIAL`
          : `Claim when ${ratioLabel} SOCIAL`
      }
      onClick={onClaim}
    />
  );

  if (loading) {
    return (
      <div className={metricRowClass}>
        <ClaimProgressSkeleton />
        {claimButton}
      </div>
    );
  }

  return (
    <div className={metricRowClass}>
      <div
        className={trackClass}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          canClaim
            ? `${ratioLabel} SOCIAL ready to claim`
            : `${ratioLabel} SOCIAL claimable, ${remainingLabel} more to minimum`
        }
      >
        <div
          className={cn(
            'h-1 w-full overflow-hidden rounded-full bg-[var(--portal-green-bg)]',
            showClaimGlow && 'bg-[var(--portal-green-bg)]'
          )}
        >
          <div
            className={cn(
              'h-full rounded-full bg-[var(--portal-green)] transition-[width] duration-300',
              showClaimGlow &&
                'shadow-[0_0_10px_-2px_var(--portal-green-shadow)]'
            )}
            style={{ width: `${barFill}%` }}
          />
        </div>
      </div>

      <span className={ratioClass} aria-hidden>
        {ratioLabel}
      </span>

      {claimButton}
    </div>
  );
}
