'use client';

import { CircleHelp } from 'lucide-react';
import { formatSocialCompact } from '@/lib/leaderboard';
import {
  PORTAL_REWARD_EMPTY_HINT,
  PORTAL_REWARD_MIN_CLAIM_YOCTO,
} from '@/lib/portal-reward-constants';
import {
  walletDropdownAccessoryButtonClass,
  walletDropdownAccessoryIconClass,
  walletDropdownAccessoryIconStroke,
} from '@/components/ui/inline-icon-button';
import { walletMenuProfileHoverClass } from '@/components/ui/floating-panel';
import { RewardsClaimButton } from '@/components/rewards-claim-button';
import { cn } from '@/lib/utils';

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
  const ratioLabel = formatClaimRatioLabel(
    claimableYocto,
    PORTAL_REWARD_MIN_CLAIM_YOCTO
  );
  const remainingLabel = formatSocialCompact(remainingToClaimYocto.toString());
  const progress = claimProgressPercent(claimableYocto);
  const showWalletLoading = walletBalanceLoading && !walletHasLoadedBalance;
  const showRewardsDetail = !rewardsLoading;
  const showEmptyHint =
    showRewardsDetail &&
    !walletBalanceLoading &&
    walletHasLoadedBalance &&
    claimableYocto === 0n &&
    walletBalanceYocto === 0n &&
    !walletBalanceError;
  const barFill = claimableYocto > 0n ? Math.max(progress, 3) : 0;
  const showClaimGlow = canClaim && barFill > 0;

  return (
    <div className={cn(compact ? 'space-y-1.5' : 'space-y-2.5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {showWalletLoading ? (
            <div className="h-5 w-[4.5rem] animate-pulse rounded bg-muted/40" />
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
                    compact ? 'portal-type-lead' : 'portal-type-lead',
                    walletBalanceLoading &&
                      walletHasLoadedBalance &&
                      'opacity-50'
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
          {walletBalanceError ? (
            <p className="mt-1 portal-type-label text-[var(--portal-amber)]">
              {walletBalanceError}
            </p>
          ) : null}
        </div>

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

      <div className="flex items-center gap-1.5 md:gap-2">
        {showRewardsDetail ? (
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center',
              compact ? 'min-h-[1rem]' : 'min-h-[1.25rem] md:min-h-[1.75rem]'
            )}
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
        ) : (
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center',
              compact ? 'min-h-[1rem]' : 'min-h-[1.25rem] md:min-h-[1.75rem]'
            )}
          >
            <div className="h-1 w-full animate-pulse rounded-full bg-muted/30" />
          </div>
        )}

        {showRewardsDetail ? (
          <span
            className={cn(
              'shrink-0 font-mono portal-type-caption font-medium tabular-nums leading-none',
              canClaim
                ? 'text-[var(--portal-green)]'
                : 'text-muted-foreground/50'
            )}
            aria-hidden
          >
            {ratioLabel}
          </span>
        ) : (
          <span className="h-3 w-12 shrink-0 animate-pulse rounded bg-muted/30" />
        )}

        <RewardsClaimButton
          canClaim={canClaim}
          claiming={claiming}
          appearance="inline"
          compact={compact}
          disabled={!showRewardsDetail || rewardsLoading}
          ariaLabel={
            canClaim
              ? `Claim ${ratioLabel} SOCIAL`
              : `Claim when ${ratioLabel} SOCIAL`
          }
          onClick={onClaim}
        />
      </div>

      {showEmptyHint ? (
        <p className="portal-type-caption leading-snug text-muted-foreground/55">
          {PORTAL_REWARD_EMPTY_HINT}
        </p>
      ) : null}
    </div>
  );
}
