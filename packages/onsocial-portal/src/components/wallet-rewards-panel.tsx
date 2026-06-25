'use client';

import Link from 'next/link';
import { ArrowLeftRight, CircleHelp } from 'lucide-react';
import { formatSocialCompact } from '@/lib/leaderboard';
import { PORTAL_REWARD_EMPTY_HINT } from '@/lib/portal-reward-constants';
import {
  walletDropdownAccessoryButtonClass,
  walletDropdownAccessoryIconClass,
  walletDropdownAccessoryIconStroke,
} from '@/components/ui/inline-icon-button';
import {
  walletMenuBalanceRowClass,
  walletMenuMetricCaptionSlotClass,
  walletMenuMetricRowClass,
  walletMenuMetricRatioSlotClass,
  walletMenuProfileHoverClass,
  walletMenuProgressTrackSlotClass,
  walletMenuRewardsBlockClass,
} from '@/components/ui/floating-panel';
import { RewardsClaimMetricRow } from '@/components/rewards-claim-metric-row';
import { Skeleton } from '@/components/ui/skeleton';
import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';
import { cn } from '@/lib/utils';

export {
  claimProgressPercent,
  formatClaimRatioLabel,
} from '@/lib/rewards-claim-progress';

interface WalletRewardsSectionProps {
  compact?: boolean;
  walletBalanceYocto: bigint;
  walletBalanceLoading: boolean;
  walletBalanceError: string | null;
  walletHasLoadedBalance: boolean;
  claimableYocto: bigint;
  canClaim: boolean;
  claiming: boolean;
  rewardsLoading: boolean;
  remainingToClaimYocto: bigint;
  onClaim: () => void | Promise<void>;
  onOpenRules: () => void;
  onOpenAssets?: () => void;
}

function WalletMenuBalanceSkeleton() {
  return (
    <div className="flex items-baseline gap-1.5" aria-hidden>
      <Skeleton className="h-3.5 w-[4.5rem] rounded md:h-4" />
      <Skeleton className="h-2.5 w-10 rounded bg-foreground/[0.06]" />
    </div>
  );
}

function WalletMenuClaimProgressSkeleton() {
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

/** Money + claim progress block (embedded in the wallet menu card). */
export function WalletRewardsSection({
  compact = false,
  walletBalanceYocto,
  walletBalanceLoading,
  walletBalanceError,
  walletHasLoadedBalance,
  claimableYocto,
  canClaim,
  claiming,
  rewardsLoading,
  remainingToClaimYocto,
  onClaim,
  onOpenRules,
  onOpenAssets,
}: WalletRewardsSectionProps) {
  const walletLabel = walletBalanceError
    ? '—'
    : formatSocialCompact(walletBalanceYocto.toString());
  const showWalletLoading = walletBalanceLoading && !walletHasLoadedBalance;
  const showRewardsDetail = !rewardsLoading;
  const showEmptyHint =
    showRewardsDetail &&
    !walletBalanceLoading &&
    walletHasLoadedBalance &&
    claimableYocto === 0n &&
    walletBalanceYocto === 0n &&
    !walletBalanceError;
  const hintLine = walletBalanceError
    ? walletBalanceError
    : showEmptyHint
      ? PORTAL_REWARD_EMPTY_HINT
      : null;
  const reserveHintSlot = compact;

  const balanceRow = (
    <div
      className={
        compact
          ? walletMenuBalanceRowClass
          : 'flex items-center justify-between gap-2'
      }
    >
      <div className="min-w-0 flex-1">
        {showWalletLoading ? (
          <WalletMenuBalanceSkeleton />
        ) : onOpenAssets ? (
          <button
            type="button"
            onClick={onOpenAssets}
            className={cn(
              walletMenuProfileHoverClass,
              '-mx-1 min-w-0 px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-neutral-border-strong)]'
            )}
            aria-label={`${walletLabel} SOCIAL — view wallet assets`}
          >
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'text-portal-neutral font-mono font-semibold leading-none tracking-tight tabular-nums',
                  'portal-type-lead',
                  walletBalanceLoading && walletHasLoadedBalance && 'opacity-50'
                )}
              >
                {walletLabel}
              </span>
              <span className="font-mono portal-type-caption font-medium tabular-nums text-muted-foreground/55">
                SOCIAL
              </span>
            </div>
          </button>
        ) : (
          <div
            className="flex items-baseline gap-1.5"
            aria-label={`${walletLabel} SOCIAL`}
          >
            <span
              className={cn(
                'text-portal-neutral font-mono font-semibold leading-none tracking-tight tabular-nums',
                compact ? 'portal-type-lead' : 'portal-type-lead',
                walletBalanceLoading && walletHasLoadedBalance && 'opacity-50'
              )}
            >
              {walletLabel}
            </span>
            <span className="font-mono portal-type-caption font-medium tabular-nums text-muted-foreground/55">
              SOCIAL
            </span>
          </div>
        )}
        {!compact && walletBalanceError ? (
          <p className="mt-1 portal-type-label text-[var(--portal-amber)]">
            {walletBalanceError}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {PORTAL_SWAP_ENABLED ? (
          <Link
            href="/swap"
            className={walletDropdownAccessoryButtonClass}
            aria-label="Get SOCIAL"
          >
            <ArrowLeftRight
              className={walletDropdownAccessoryIconClass}
              strokeWidth={walletDropdownAccessoryIconStroke}
            />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onOpenRules}
          className={walletDropdownAccessoryButtonClass}
          aria-label="How rewards work"
        >
          <CircleHelp
            className={walletDropdownAccessoryIconClass}
            strokeWidth={walletDropdownAccessoryIconStroke}
          />
        </button>
      </div>
    </div>
  );

  const claimRow = showRewardsDetail ? (
    <RewardsClaimMetricRow
      claimableYocto={claimableYocto}
      canClaim={canClaim}
      claiming={claiming}
      remainingToClaimYocto={remainingToClaimYocto}
      compact={compact}
      onClaim={onClaim}
    />
  ) : (
    <div
      className={
        compact
          ? walletMenuMetricRowClass
          : 'flex items-center gap-1.5 md:gap-2'
      }
    >
      <WalletMenuClaimProgressSkeleton />
    </div>
  );

  return (
    <div className={compact ? walletMenuRewardsBlockClass : 'space-y-2.5'}>
      {balanceRow}
      {claimRow}

      {reserveHintSlot && hintLine ? (
        <p
          className={cn(
            walletMenuMetricCaptionSlotClass,
            walletBalanceError ? 'text-[var(--portal-amber)]' : undefined
          )}
        >
          {hintLine}
        </p>
      ) : showEmptyHint ? (
        <p className="portal-type-caption leading-snug text-muted-foreground/55">
          {PORTAL_REWARD_EMPTY_HINT}
        </p>
      ) : null}
    </div>
  );
}
