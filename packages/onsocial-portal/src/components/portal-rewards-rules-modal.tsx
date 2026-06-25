'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { formatClaimRatioLabel } from '@/lib/rewards-claim-progress';
import { RewardsClaimMetricRow } from '@/components/rewards-claim-metric-row';
import { CompactInlineProgressRow } from '@/components/ui/compact-inline-progress-row';
import {
  compactModalBodyClass,
  compactModalBodyDenseClass,
  compactModalInsetShellPadClass,
  compactModalShellClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { usePortalRewardsOptional } from '@/contexts/portal-rewards-context';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { formatSocialCompact } from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  PORTAL_REWARD_ACTION_RULES,
  PORTAL_REWARD_CREDIT_YOCTO,
  PORTAL_REWARD_MIN_CLAIM_YOCTO,
  resolvePortalRewardActionProgress,
  type PortalRewardActionProgress,
} from '@/lib/portal-reward-constants';
import { cn } from '@/lib/utils';

interface PortalRewardsRulesModalProps {
  open: boolean;
  accountId: string | null;
  onOpenChange: (open: boolean) => void;
}

function rewardAmountShortLabel(): string {
  return `${formatSocialCompact(PORTAL_REWARD_CREDIT_YOCTO.toString())} SOCIAL each`;
}

function minClaimLabel(): string {
  return formatSocialCompact(PORTAL_REWARD_MIN_CLAIM_YOCTO.toString());
}

function portalRewardsHeaderHint({
  accountId,
  claimableYocto,
  canClaim,
  loading,
}: {
  accountId: string | null;
  claimableYocto: bigint;
  canClaim: boolean;
  loading: boolean;
}): string {
  if (!accountId) {
    return 'Connect a wallet to view reward progress';
  }
  if (loading) {
    return `@${accountId} · Portal activity rewards`;
  }
  const claimLabel = formatSocialCompact(claimableYocto.toString());
  if (canClaim) {
    return `${claimLabel} SOCIAL ready to claim`;
  }
  return `${claimLabel} SOCIAL claimable`;
}

function PortalRewardsRulesContent({
  showProgress,
  loading,
  claimableYocto,
  canClaim,
  claiming,
  remainingToClaimYocto,
  totalEarnedYocto,
  portalDailyEarnedYocto,
  portalDailyCapYocto,
  progress,
  onClaim,
  onPartnersLinkClick,
}: {
  showProgress: boolean;
  loading: boolean;
  claimableYocto: bigint;
  canClaim: boolean;
  claiming: boolean;
  remainingToClaimYocto: bigint;
  totalEarnedYocto: bigint;
  portalDailyEarnedYocto: bigint;
  portalDailyCapYocto: bigint;
  progress: PortalRewardActionProgress | null;
  onClaim: () => void | Promise<void>;
  onPartnersLinkClick: () => void;
}) {
  const dailyRatio =
    portalDailyCapYocto > 0n
      ? formatClaimRatioLabel(portalDailyEarnedYocto, portalDailyCapYocto)
      : '0/1';
  const dailyPct =
    portalDailyCapYocto > 0n
      ? Math.min(
          100,
          Math.round(
            Number((portalDailyEarnedYocto * 100n) / portalDailyCapYocto)
          )
        )
      : 0;
  const lifetimeLabel = formatSocialCompact(totalEarnedYocto.toString());

  return (
    <div className="space-y-0">
      <div
        className={cn(
          'rounded-xl bg-background/35',
          compactModalInsetShellPadClass
        )}
      >
        <div className="grid grid-cols-1 gap-1.5">
          {showProgress ? (
            <div className="mb-2">
              <RewardsClaimMetricRow
                loading={loading}
                claimableYocto={claimableYocto}
                canClaim={canClaim}
                claiming={claiming}
                remainingToClaimYocto={remainingToClaimYocto}
                compact
                onClaim={onClaim}
              />
            </div>
          ) : null}

          {showProgress && portalDailyCapYocto > 0n ? (
            <CompactInlineProgressRow
              label="Today"
              ratioLabel={dailyRatio}
              value={dailyPct}
              max={100}
              loading={loading}
            />
          ) : null}

          {PORTAL_REWARD_ACTION_RULES.map((rule) => {
            const entry = resolvePortalRewardActionProgress(
              showProgress ? progress : null,
              rule.action,
              rule.cap
            );
            return (
              <CompactInlineProgressRow
                key={rule.action}
                label={rule.shortLabel}
                ratioLabel={`${entry.count}/${entry.cap}`}
                value={entry.count}
                max={entry.cap}
                loading={showProgress && loading}
              />
            );
          })}
        </div>
      </div>

      <div
        className="mt-3 space-y-1.5 border-t border-fade-section pt-2.5"
        role="group"
        aria-label="Reward rules"
      >
        <p className="portal-type-label leading-snug text-muted-foreground/75">
          {rewardAmountShortLabel()} · Claim at{' '}
          <span className="font-mono tabular-nums text-foreground/75">
            {minClaimLabel()} SOCIAL
          </span>{' '}
          minimum
        </p>
        <p className="portal-type-label leading-snug text-muted-foreground/75">
          Including portal,{' '}
          <Link
            href="/partners"
            className="text-foreground/75 underline decoration-border/70 underline-offset-2 hover:text-foreground"
            onClick={onPartnersLinkClick}
          >
            partners
          </Link>
          , and Telegram
        </p>
        {showProgress && totalEarnedYocto > 0n ? (
          <p className="portal-type-label leading-snug text-muted-foreground/65">
            Lifetime {lifetimeLabel} SOCIAL
          </p>
        ) : null}
        <p className="portal-type-caption leading-snug text-muted-foreground/55">
          Daily caps reset midnight UTC
        </p>
      </div>
    </div>
  );
}

export function PortalRewardsRulesModal({
  open,
  accountId,
  onOpenChange,
}: PortalRewardsRulesModalProps) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rewards = usePortalRewardsOptional();
  const refreshRewardsState = rewards?.refreshRewardsState;
  useBodyScrollLock(open, scrollRef);

  useEffect(() => {
    if (!open || !refreshRewardsState) return;
    void refreshRewardsState({ fresh: true, silent: true });
  }, [open, refreshRewardsState]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  if (typeof document === 'undefined') return null;

  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const totalEarnedYocto = rewards?.totalEarnedYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
  const claiming = rewards?.claiming ?? false;
  const remainingToClaimYocto = rewards?.remainingToClaimYocto ?? 0n;
  const progressLoading = rewards?.loading ?? false;
  const showProgress = rewards != null;
  const portalDailyEarnedYocto = rewards?.portalDailyEarnedYocto ?? 0n;
  const portalDailyCapYocto = rewards?.portalDailyCapYocto ?? 0n;
  const actionProgress = rewards?.actionProgress ?? null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483645] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close rewards rules"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 14,
              scale: 0.98,
              duration: 0.22,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(compactModalShellClass, portalElevatedShadowClass)}
          >
            <ModalHeader
              titleId={titleId}
              title="How rewards work"
              description={portalRewardsHeaderHint({
                accountId,
                claimableYocto,
                canClaim,
                loading: showProgress && progressLoading,
              })}
              descriptionVariant="meta"
              bordered
              actions={
                <ModalCloseButton
                  ariaLabel="Close rewards rules"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div
              ref={scrollRef}
              className={cn(
                compactModalBodyClass,
                compactModalBodyDenseClass,
                'max-h-[min(72vh,34rem)]'
              )}
            >
              <PortalRewardsRulesContent
                showProgress={showProgress}
                loading={progressLoading}
                claimableYocto={claimableYocto}
                canClaim={canClaim}
                claiming={claiming}
                remainingToClaimYocto={remainingToClaimYocto}
                totalEarnedYocto={totalEarnedYocto}
                portalDailyEarnedYocto={portalDailyEarnedYocto}
                portalDailyCapYocto={portalDailyCapYocto}
                progress={actionProgress}
                onClaim={async () => {
                  await rewards?.claimRewards();
                }}
                onPartnersLinkClick={() => onOpenChange(false)}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
