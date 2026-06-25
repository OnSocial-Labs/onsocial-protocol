'use client';

import { useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  compactModalBodyClass,
  compactModalBodyDenseClass,
  compactModalShellClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import {
  SeasonZeroRulesContent,
  seasonZeroRulesHeaderHint,
} from '@/features/season/season-zero-rules-content';
import type { SeasonZeroScoringLimits } from '@/features/season/season-zero-earn-panel';
import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import type { SeasonZeroPayoutParticipant } from '@/features/season/season-zero-payout-estimate';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function SeasonZeroRulesModal({
  open,
  onOpenChange,
  limits,
  myStanding = null,
  participantCount = 0,
  indexedPoolYocto = '0',
  payoutParticipants = null,
  personalAccountId = null,
  profileBadgeLabel = 'Rally',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}) {
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  useBodyScrollLock(open);

  if (typeof document === 'undefined') {
    return null;
  }

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
            aria-label="Close rules and scoring"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(Boolean(reduceMotion), {
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
              title="Rules & scoring"
              description={seasonZeroRulesHeaderHint(limits, myStanding)}
              descriptionVariant="meta"
              bordered
              actions={
                <ModalCloseButton
                  ariaLabel="Close rules and scoring"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div
              className={cn(
                compactModalBodyClass,
                compactModalBodyDenseClass,
                'max-h-[min(72vh,34rem)]'
              )}
            >
              <SeasonZeroRulesContent
                limits={limits}
                myStanding={myStanding}
                participantCount={participantCount}
                indexedPoolYocto={indexedPoolYocto}
                payoutParticipants={payoutParticipants}
                personalAccountId={personalAccountId}
                profileBadgeLabel={profileBadgeLabel}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
