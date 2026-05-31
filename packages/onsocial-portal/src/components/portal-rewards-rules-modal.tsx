'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import {
  claimProgressPercent,
  formatClaimRatioLabel,
} from '@/components/wallet-rewards-panel';
import {
  compactModalBodyClass,
  compactModalShellClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import {
  ModalFactRow,
  ModalFactSection,
} from '@/components/ui/modal-fact-list';
import { ModalHeader } from '@/components/ui/modal-header';
import { RewardsClaimButton } from '@/components/rewards-claim-button';
import { usePortalRewardsOptional } from '@/contexts/portal-rewards-context';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { formatSocialCompact } from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  PORTAL_REWARD_ACTION_RULES,
  PORTAL_REWARD_CREDIT_YOCTO,
  PORTAL_REWARD_MIN_CLAIM_YOCTO,
} from '@/lib/portal-reward-constants';
import { cn } from '@/lib/utils';

interface PortalRewardsRulesModalProps {
  open: boolean;
  accountId: string | null;
  onOpenChange: (open: boolean) => void;
}

function rewardAmountShortLabel(): string {
  return `${formatSocialCompact(PORTAL_REWARD_CREDIT_YOCTO.toString())} each`;
}

function minClaimLabel(): string {
  return formatSocialCompact(PORTAL_REWARD_MIN_CLAIM_YOCTO.toString());
}

function RewardsStatusCard({
  loading,
  claimableYocto,
  canClaim,
  claiming,
  portalDailyEarnedYocto,
  portalDailyCapYocto,
  totalEarnedYocto,
  onClaim,
}: {
  loading: boolean;
  claimableYocto: bigint;
  canClaim: boolean;
  claiming: boolean;
  portalDailyEarnedYocto: bigint;
  portalDailyCapYocto: bigint;
  totalEarnedYocto: bigint;
  onClaim: () => void | Promise<void>;
}) {
  const ratioLabel = formatClaimRatioLabel(
    claimableYocto,
    PORTAL_REWARD_MIN_CLAIM_YOCTO
  );
  const progress = claimProgressPercent(claimableYocto);
  const barFill = claimableYocto > 0n ? Math.max(progress, 3) : 0;
  const showClaimGlow = canClaim && barFill > 0;
  const claimLabel = formatSocialCompact(claimableYocto.toString());

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-6 w-32 animate-pulse rounded bg-muted/35" />
        <div className="flex items-center gap-2">
          <div className="h-1 min-w-0 flex-1 animate-pulse rounded-full bg-muted/30" />
          <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
          <div className="h-7 w-14 animate-pulse rounded-full bg-muted/30" />
        </div>
        <div className="h-3 w-48 animate-pulse rounded bg-muted/30" />
      </div>
    );
  }

  const metaParts: string[] = [];
  if (portalDailyCapYocto > 0n) {
    metaParts.push(
      `Today ${formatSocialCompact(portalDailyEarnedYocto.toString())}/${formatSocialCompact(portalDailyCapYocto.toString())}`
    );
  }
  metaParts.push(
    `Lifetime ${formatSocialCompact(totalEarnedYocto.toString())} SOCIAL`
  );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-semibold tabular-nums tracking-tight text-foreground">
          {claimLabel}
        </span>
        <span className="portal-type-label font-medium text-muted-foreground/55">
          SOCIAL {canClaim ? 'ready to claim' : 'claimable'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex min-h-[1.25rem] min-w-0 flex-1 items-center"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${ratioLabel} SOCIAL toward claim minimum`}
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

        <span
          className={cn(
            'shrink-0 font-mono portal-type-label font-medium tabular-nums leading-none',
            canClaim ? 'text-[var(--portal-green)]' : 'text-muted-foreground/50'
          )}
          aria-hidden
        >
          {ratioLabel}
        </span>

        <RewardsClaimButton
          canClaim={canClaim}
          claiming={claiming}
          ariaLabel={
            canClaim
              ? `Claim ${ratioLabel} SOCIAL`
              : `Claim when ${ratioLabel} SOCIAL`
          }
          onClick={onClaim}
        />
      </div>

      <p className="portal-type-label leading-snug text-muted-foreground/55">
        {metaParts.join(' · ')}
      </p>
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
  useBodyScrollLock(open, scrollRef);

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
  const portalDailyEarnedYocto = rewards?.portalDailyEarnedYocto ?? 0n;
  const portalDailyCapYocto = rewards?.portalDailyCapYocto ?? 0n;
  const canClaim = rewards?.canClaim ?? false;
  const claiming = rewards?.claiming ?? false;
  const progressLoading = rewards?.loading ?? false;
  const showProgress = rewards != null;

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
              description={
                accountId
                  ? `@${accountId} · Portal activity rewards`
                  : 'Connect a wallet to view reward progress'
              }
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
              className={cn(compactModalBodyClass, 'space-y-5')}
            >
              {showProgress ? (
                <>
                  <RewardsStatusCard
                    loading={progressLoading}
                    claimableYocto={claimableYocto}
                    canClaim={canClaim}
                    claiming={claiming}
                    portalDailyEarnedYocto={portalDailyEarnedYocto}
                    portalDailyCapYocto={portalDailyCapYocto}
                    totalEarnedYocto={totalEarnedYocto}
                    onClaim={async () => {
                      await rewards?.claimRewards();
                    }}
                  />
                  <div
                    className="h-px w-full shrink-0 divider-section"
                    role="separator"
                    aria-hidden
                  />
                </>
              ) : null}

              <ModalFactSection
                title="Earn on the portal"
                aside={
                  <span className="font-mono tabular-nums">
                    {rewardAmountShortLabel()}
                  </span>
                }
              >
                {PORTAL_REWARD_ACTION_RULES.map((rule) => (
                  <ModalFactRow
                    key={rule.label}
                    label={rule.label}
                    value={rule.limit}
                  />
                ))}
              </ModalFactSection>

              <p className="portal-type-label leading-relaxed text-muted-foreground/60">
                Claim at{' '}
                <span className="font-mono tabular-nums text-foreground/75">
                  {minClaimLabel()} SOCIAL
                </span>{' '}
                from your wallet menu. Includes portal,{' '}
                <Link
                  href="/partners"
                  className="text-foreground/75 underline decoration-border/70 underline-offset-2 hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  partners
                </Link>
                , and Telegram — caps may differ.
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
