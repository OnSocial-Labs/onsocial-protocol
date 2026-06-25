'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type CollectCelebrationProps = {
  active: boolean;
  celebrationKey: string | number;
  children: ReactNode;
  icon?: ReactNode;
  reduceMotion?: boolean | null;
  durationSeconds?: number;
  sweepDurationSeconds?: number;
  /** Hero collect zones (boost / season rally) vs compact profile pill. */
  variant?: 'hero' | 'inline';
  tone?: 'green' | 'gold';
  className?: string;
  chipClassName?: string;
  sweepClassName?: string;
  ariaLive?: 'polite' | 'assertive' | 'off';
};

const PORTAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function collectCelebrationToneClass(tone: 'green' | 'gold'): string {
  return tone === 'gold' ? 'portal-gold-text' : 'portal-green-text';
}

function collectCelebrationChipClass(
  tone: 'green' | 'gold',
  variant: 'hero' | 'inline'
): string {
  const frame =
    tone === 'gold'
      ? 'border-[var(--portal-gold-border)] shadow-[0_12px_28px_-22px_var(--portal-gold-shadow)]'
      : 'border-[var(--portal-green-frame-border)] shadow-[0_18px_44px_-28px_var(--portal-green)]';

  if (variant === 'inline') {
    return cn(
      collectCelebrationToneClass(tone),
      frame,
      'flex h-6 items-center gap-1 rounded-full border bg-background/95 px-2 font-mono portal-type-caption font-semibold tabular-nums backdrop-blur-md'
    );
  }

  return cn(
    collectCelebrationToneClass(tone),
    frame,
    'flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 font-mono portal-type-label font-semibold tabular-nums backdrop-blur-md'
  );
}

function collectCelebrationSweepClass(
  tone: 'green' | 'gold',
  variant: 'hero' | 'inline'
): string {
  const via =
    tone === 'gold' ? 'via-[var(--portal-gold)]' : 'via-[var(--portal-green)]';

  if (variant === 'inline') {
    return cn(
      'pointer-events-none absolute inset-x-0 top-0 h-px origin-left bg-gradient-to-r from-transparent to-transparent',
      via
    );
  }

  return cn(
    'pointer-events-none absolute inset-x-6 top-[3.7rem] h-px origin-left bg-gradient-to-r from-transparent to-transparent',
    via
  );
}

export function CollectCelebration({
  active,
  celebrationKey,
  children,
  icon,
  reduceMotion = false,
  durationSeconds = reduceMotion ? 1.15 : 1.75,
  sweepDurationSeconds = 1.18,
  variant = 'hero',
  tone = 'green',
  className,
  chipClassName,
  sweepClassName,
  ariaLive = 'polite',
}: CollectCelebrationProps) {
  const isInline = variant === 'inline';
  const resolvedDurationSeconds = durationSeconds;

  return (
    <>
      <AnimatePresence initial={false}>
        {active && !reduceMotion && (
          <motion.div
            key={`collect-sweep-${celebrationKey}`}
            aria-hidden="true"
            className={cn(
              collectCelebrationSweepClass(tone, variant),
              sweepClassName
            )}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{
              opacity: [0, 0.8, 0],
              scaleX: [0, 1, 1],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: sweepDurationSeconds,
              ease: PORTAL_EASE,
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key={`collect-chip-${celebrationKey}`}
            aria-live={ariaLive}
            className={cn(
              isInline
                ? 'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2'
                : 'pointer-events-none absolute inset-x-0 top-[3.4rem] z-20 flex justify-center',
              className
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: resolvedDurationSeconds,
              times: [0, 0.18, 0.72, 1],
              ease: PORTAL_EASE,
            }}
          >
            <motion.div
              className={cn(
                collectCelebrationChipClass(tone, variant),
                chipClassName
              )}
              initial={
                reduceMotion ? undefined : { y: isInline ? 6 : 12, scale: 0.96 }
              }
              animate={
                reduceMotion
                  ? undefined
                  : isInline
                    ? {
                        y: [6, -2, -10, -14],
                        scale: [0.96, 1.02, 1, 0.98],
                      }
                    : {
                        y: [12, -4, -22, -34],
                        scale: [0.96, 1.02, 1, 0.98],
                      }
              }
              transition={{
                duration: resolvedDurationSeconds,
                times: [0, 0.2, 0.72, 1],
                ease: PORTAL_EASE,
              }}
            >
              {icon}
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
