'use client';

import { useEffect, useRef } from 'react';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  ProfileSocialCollectPill,
  profileSocialCollectAriaLabel,
} from '@/components/ui/profile-social-collect-pill';
import { useSeasonZeroClaimActions } from '@/features/season/season-zero-claim-actions';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { seasonSettlementPoolSummary } from '@/features/season/season-zero-settlement-copy';
import { useCollectCelebration } from '@/hooks/use-collect-celebration';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

function seasonCollectAriaLabel(amountLabel: string): string {
  return `${profileSocialCollectAriaLabel(amountLabel)} season reward`;
}

export function SeasonClaimInlineAction({
  claim,
  onClaimed,
  variant = 'rally',
  settlement = null,
  className,
}: {
  claim: SeasonZeroClaimRecord;
  onClaimed?: () => void;
  /** `rally` — footer pill on season page. `profile` — gesture pill beside Support. */
  variant?: 'rally' | 'profile';
  /** Published settlement summary — pool context beside collect on rally page. */
  settlement?: SeasonZeroSettlementSummary | null;
  className?: string;
}) {
  const {
    handleClaim,
    phase,
    isButtonVisible,
    isButtonLoading,
    isCollectSettled,
    txResult,
    clearTxResult,
  } = useSeasonZeroClaimActions({ claim, onClaimed });
  const {
    celebration: seasonCollectCelebration,
    triggerCelebration: triggerSeasonCollectCelebration,
    durationSeconds: seasonCollectCelebrationDurationSeconds,
  } = useCollectCelebration({ variant: 'inline' });
  const celebratedRef = useRef(false);
  const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);
  const ariaLabel = seasonCollectAriaLabel(amountLabel);
  const showRallyCollectRow =
    variant === 'rally' && (isButtonVisible || Boolean(settlement));
  const showProfileCollect =
    variant === 'profile' &&
    (isButtonVisible ||
      phase === 'confirming' ||
      Boolean(seasonCollectCelebration));

  useEffect(() => {
    celebratedRef.current = false;
  }, [claim.accountId, claim.seasonId]);

  useEffect(() => {
    if (
      variant !== 'profile' ||
      phase !== 'succeeded' ||
      celebratedRef.current
    ) {
      return;
    }
    celebratedRef.current = true;
    triggerSeasonCollectCelebration(amountLabel);
  }, [amountLabel, phase, triggerSeasonCollectCelebration, variant]);

  if (isCollectSettled && !seasonCollectCelebration) {
    return (
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
    );
  }

  const button =
    variant === 'profile' ? (
      <ProfileSocialCollectPill
        amountLabel={amountLabel}
        kind="season"
        pending={isButtonLoading}
        celebration={seasonCollectCelebration}
        celebrationDurationSeconds={seasonCollectCelebrationDurationSeconds}
        ariaLabel={ariaLabel}
        onClick={() => void handleClaim()}
        className={className}
      />
    ) : (
      <Button
        type="button"
        size="sm"
        variant="endorsement"
        className={cn('shrink-0 gap-1.5', className)}
        loading={isButtonLoading}
        aria-label={ariaLabel}
        onClick={() => void handleClaim()}
      >
        <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sm:hidden">Collect {amountLabel}</span>
        <span className="hidden sm:inline">Collect {amountLabel} SOCIAL</span>
      </Button>
    );

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      {showRallyCollectRow ? (
        <div className="border-t border-fade-section py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            {settlement ? (
              <p className="min-w-0 text-xs text-muted-foreground/80">
                {seasonSettlementPoolSummary(settlement)}
              </p>
            ) : (
              <span className="hidden sm:block sm:flex-1" aria-hidden />
            )}
            {isButtonVisible ? (
              <div className="flex shrink-0 justify-end">{button}</div>
            ) : null}
          </div>
        </div>
      ) : showProfileCollect ? (
        button
      ) : null}
    </>
  );
}
