'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
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
  REWARD_ECOSYSTEM_CLAIM_HINT,
} from '@/lib/portal-reward-constants';
import { cn } from '@/lib/utils';

interface PortalRewardsRulesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function rewardAmountLabel(): string {
  return `${formatSocialCompact(PORTAL_REWARD_CREDIT_YOCTO.toString())} SOCIAL`;
}

function minClaimLabel(): string {
  return `${formatSocialCompact(PORTAL_REWARD_MIN_CLAIM_YOCTO.toString())} SOCIAL`;
}

export function PortalRewardsRulesModal({
  open,
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

  const creditLabel = rewardAmountLabel();
  const claimableYocto = rewards?.claimableYocto ?? 0n;
  const totalEarnedYocto = rewards?.totalEarnedYocto ?? 0n;
  const globalDailyEarnedYocto = rewards?.globalDailyEarnedYocto ?? 0n;
  const globalDailyRemainingYocto = rewards?.globalDailyRemainingYocto ?? 0n;
  const globalDailyCapYocto = globalDailyEarnedYocto + globalDailyRemainingYocto;
  const remainingToClaimYocto = rewards?.remainingToClaimYocto ?? 0n;
  const showProgress =
    rewards != null &&
    !rewards.loading &&
    (claimableYocto > 0n ||
      totalEarnedYocto > 0n ||
      globalDailyEarnedYocto > 0n);

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
            className={cn(
              'relative flex max-h-[min(640px,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
              portalElevatedShadowClass
            )}
          >
            <ModalHeader
              titleId={titleId}
              eyebrow="OnSocial"
              title="How rewards work"
              description="Earn SOCIAL from portal activity, then claim to your wallet."
              actions={
                <ModalCloseButton
                  ariaLabel="Close rewards rules"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 md:px-5"
            >
              {showProgress ? (
                <section className="mb-4 rounded-xl border border-border/45 bg-muted/18 px-3 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
                    Your progress
                  </p>
                  <dl className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground/80">
                    {globalDailyCapYocto > 0n ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Today</dt>
                        <dd className="font-mono text-foreground/90">
                          {formatSocialCompact(globalDailyEarnedYocto.toString())}{' '}
                          /{' '}
                          {formatSocialCompact(globalDailyCapYocto.toString())}{' '}
                          SOCIAL
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex items-baseline justify-between gap-3">
                      <dt>Ready to claim</dt>
                      <dd className="font-mono text-foreground/90">
                        {formatSocialCompact(claimableYocto.toString())} SOCIAL
                      </dd>
                    </div>
                    {remainingToClaimYocto > 0n ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Until claim unlocks</dt>
                        <dd className="font-mono text-foreground/90">
                          {formatSocialCompact(remainingToClaimYocto.toString())}{' '}
                          SOCIAL
                        </dd>
                      </div>
                    ) : null}
                    {totalEarnedYocto > 0n ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Total earned</dt>
                        <dd className="font-mono text-foreground/90">
                          {formatSocialCompact(totalEarnedYocto.toString())} SOCIAL
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>
              ) : null}

              <section className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
                  Earn on the portal
                </p>
                <ul className="mt-2 space-y-2">
                  {PORTAL_REWARD_ACTION_RULES.map((rule) => (
                    <li
                      key={rule.label}
                      className="flex items-start justify-between gap-3 text-[12px] leading-snug"
                    >
                      <span className="text-foreground/90">{rule.label}</span>
                      <span className="shrink-0 text-right text-muted-foreground/70">
                        <span className="font-mono text-foreground/85">
                          {creditLabel}
                        </span>
                        <span className="block text-[10px] text-muted-foreground/55">
                          {rule.limit}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mb-4 space-y-2 text-[12px] leading-relaxed text-muted-foreground/75">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
                  Claim
                </p>
                <p>
                  Claim when you reach at least{' '}
                  <span className="font-mono text-foreground/90">
                    {minClaimLabel()}
                  </span>
                  . Use the green Claim button in your wallet menu.
                </p>
                <p>{REWARD_ECOSYSTEM_CLAIM_HINT}.</p>
              </section>

              <p className="text-[11px] leading-relaxed text-muted-foreground/60">
                Also earn in{' '}
                <Link
                  href="/partners"
                  className="text-foreground/75 underline decoration-border/70 underline-offset-2 hover:text-foreground"
                  onClick={() => onOpenChange(false)}
                >
                  partner apps
                </Link>{' '}
                and linked Telegram groups — rates and caps may differ.
              </p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
