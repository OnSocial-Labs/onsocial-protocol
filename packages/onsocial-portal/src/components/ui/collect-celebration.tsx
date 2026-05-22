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
  className?: string;
  chipClassName?: string;
  sweepClassName?: string;
  ariaLive?: 'polite' | 'assertive' | 'off';
};

const PORTAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CollectCelebration({
  active,
  celebrationKey,
  children,
  icon,
  reduceMotion = false,
  durationSeconds = reduceMotion ? 1.15 : 1.75,
  sweepDurationSeconds = 1.18,
  className,
  chipClassName,
  sweepClassName,
  ariaLive = 'polite',
}: CollectCelebrationProps) {
  return (
    <>
      <AnimatePresence initial={false}>
        {active && !reduceMotion && (
          <motion.div
            key={`collect-sweep-${celebrationKey}`}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-6 top-[3.7rem] h-px origin-left bg-gradient-to-r from-transparent via-[var(--portal-green)] to-transparent',
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
              'pointer-events-none absolute inset-x-0 top-[3.4rem] z-20 flex justify-center',
              className
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: durationSeconds,
              times: [0, 0.18, 0.72, 1],
              ease: PORTAL_EASE,
            }}
          >
            <motion.div
              className={cn(
                'portal-green-text flex items-center gap-1.5 rounded-full border border-[var(--portal-green-frame-border)] bg-background/95 px-3 py-1.5 font-mono text-[11px] font-semibold tabular-nums shadow-[0_18px_44px_-28px_var(--portal-green)] backdrop-blur-md',
                chipClassName
              )}
              initial={reduceMotion ? undefined : { y: 12, scale: 0.96 }}
              animate={
                reduceMotion
                  ? undefined
                  : {
                      y: [12, -4, -22, -34],
                      scale: [0.96, 1.02, 1, 0.98],
                    }
              }
              transition={{
                duration: durationSeconds,
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
