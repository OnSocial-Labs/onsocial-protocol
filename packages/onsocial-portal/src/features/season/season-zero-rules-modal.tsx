'use client';

import { useId } from 'react';
import {
  compactModalBodyClass,
  compactModalBodyDenseClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { Sheet } from '@/components/ui/sheet';
import {
  SeasonZeroRulesContent,
  seasonZeroRulesHeaderHint,
} from '@/features/season/season-zero-rules-content';
import type { SeasonZeroScoringLimits } from '@/features/season/season-zero-earn-panel';
import type { SeasonZeroStanding } from '@/features/season/season-zero-standing-row';
import type { SeasonZeroPayoutParticipant } from '@/features/season/season-zero-payout-estimate';
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

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      ariaLabelledby={titleId}
      dismissLabel="Close rules and scoring"
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
          'md:max-h-[min(72vh,34rem)]'
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
    </Sheet>
  );
}
