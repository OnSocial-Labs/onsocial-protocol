'use client';

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { CollectCelebration } from '@/components/ui/collect-celebration';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  profileSocialCollectButtonClass,
  profileSocialCollectGiftClass,
  profileSocialStandingToggleClass,
  profileSocialStandingToggleStateClass,
  type ProfileSocialCollectKind,
  type ProfileSocialCollectLayout,
} from '@/components/ui/profile-action-pill';
import type { CollectCelebrationState } from '@/hooks/use-collect-celebration';
import { cn } from '@/lib/utils';

export function profileSocialCollectAriaLabel(amountLabel: string): string {
  return `Collect ${amountLabel} SOCIAL`;
}

function profileSocialCollectVisibleLabel(
  amountLabel: string,
  layout: ProfileSocialCollectLayout
): string {
  if (layout === 'rail') {
    return `Collect ${amountLabel} SOCIAL`;
  }
  return `Collect · ${amountLabel}`;
}

export function ProfileSocialCollectPill({
  amountLabel,
  kind = 'support',
  layout = 'gesture',
  pending = false,
  ariaLabel,
  onClick,
  className,
  celebration = null,
  celebrationDurationSeconds,
}: {
  amountLabel: string;
  /** Green payout (support) vs gold season reward. */
  kind?: ProfileSocialCollectKind;
  /** `gesture` — profile action row; `rail` — endorsements filter rail. */
  layout?: ProfileSocialCollectLayout;
  pending?: boolean;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
  celebration?: CollectCelebrationState | null;
  celebrationDurationSeconds?: number;
}) {
  const reduceMotion = useReducedMotion();
  const visibleLabel = profileSocialCollectVisibleLabel(amountLabel, layout);
  const celebrationActive = Boolean(celebration);
  const [hideButtonAfterCelebration, setHideButtonAfterCelebration] =
    useState(false);
  const tone = kind === 'season' ? 'gold' : 'green';
  const durationSeconds =
    celebrationDurationSeconds ?? (reduceMotion ? 1.15 : 1.75);

  useEffect(() => {
    if (celebrationActive) {
      setHideButtonAfterCelebration(true);
    }
  }, [celebrationActive]);

  const hideButtonForCelebration =
    celebrationActive || hideButtonAfterCelebration;

  return (
    <div className="relative inline-flex overflow-visible">
      <CollectCelebration
        active={celebrationActive}
        celebrationKey={celebration?.id ?? 'idle'}
        reduceMotion={reduceMotion}
        durationSeconds={durationSeconds}
        variant="inline"
        tone={tone}
        icon={<Gift className="h-2.5 w-2.5 shrink-0" aria-hidden />}
      >
        +{celebration?.amountLabel ?? amountLabel}
      </CollectCelebration>
      <motion.div
        aria-hidden={hideButtonForCelebration ? true : undefined}
        animate={
          hideButtonForCelebration && !reduceMotion
            ? {
                opacity: 0,
                scale: 0.98,
                filter: 'blur(3px)',
              }
            : hideButtonForCelebration
              ? { opacity: 0, scale: 0.98 }
              : {
                  opacity: 1,
                  scale: 1,
                  filter: 'blur(0px)',
                }
        }
        transition={{
          duration: hideButtonForCelebration ? 0.28 : 0.32,
          ease: hideButtonForCelebration ? [0.4, 0, 1, 1] : [0.22, 1, 0.36, 1],
        }}
        className={cn(
          'inline-flex',
          hideButtonForCelebration && 'pointer-events-none'
        )}
      >
        <button
          type="button"
          className={cn(
            profileSocialCollectButtonClass(kind, layout),
            className
          )}
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label={ariaLabel}
          onClick={onClick}
        >
          <span className={profileSocialStandingToggleClass}>
            <span
              className={cn(
                profileSocialStandingToggleStateClass,
                'gap-1',
                layout === 'rail' && 'h-auto',
                pending && 'invisible'
              )}
              aria-hidden={pending}
            >
              <Gift
                className={profileSocialCollectGiftClass(kind, layout)}
                strokeWidth={2}
                aria-hidden
              />
              {visibleLabel}
            </span>
            <span
              className={cn(
                profileSocialStandingToggleStateClass,
                'justify-center text-current opacity-70',
                layout === 'rail' && 'h-auto',
                !pending && 'invisible'
              )}
              aria-hidden={!pending}
            >
              <PulsingDots size="sm" />
            </span>
          </span>
        </button>
      </motion.div>
    </div>
  );
}
