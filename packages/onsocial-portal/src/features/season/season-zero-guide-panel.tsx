'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  SeasonZeroRulesContent,
  seasonZeroRulesHeaderHint,
} from '@/features/season/season-zero-rules-content';
import type { SeasonZeroScoringLimits } from '@/features/season/season-zero-earn-panel';
import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import type { SeasonZeroPayoutParticipant } from '@/features/season/season-zero-payout-estimate';
import { portalTransition } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function SeasonZeroGuidePanel({
  limits,
  myStanding = null,
  participantCount = 0,
  indexedPoolYocto = '0',
  payoutParticipants = null,
  personalAccountId = null,
  profileBadgeLabel = 'Rally',
  className,
}: {
  limits: SeasonZeroScoringLimits;
  myStanding?: Pick<
    SeasonZeroStanding,
    'rank' | 'score' | 'breakdown' | 'accountId'
  > | null;
  participantCount?: number;
  indexedPoolYocto?: string;
  payoutParticipants?: SeasonZeroPayoutParticipant[] | null;
  personalAccountId?: string | null;
  profileBadgeLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const headerHint = seasonZeroRulesHeaderHint(limits, myStanding);

  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      padding="none"
      className={cn('border-border/40 p-3.5 md:p-4', className)}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block portal-eyebrow text-muted-foreground">
            Rules & scoring
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground/75">
            {headerHint}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="season-zero-guide-details"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }
            }
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={portalTransition(reduceMotion ? 0.15 : 0.24)}
            className="overflow-hidden"
          >
            <SeasonZeroRulesContent
              limits={limits}
              myStanding={myStanding}
              participantCount={participantCount}
              indexedPoolYocto={indexedPoolYocto}
              payoutParticipants={payoutParticipants}
              personalAccountId={personalAccountId}
              profileBadgeLabel={profileBadgeLabel}
              className="border-t border-fade-section pt-2.5"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SurfacePanel>
  );
}
