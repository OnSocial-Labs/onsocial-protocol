'use client';

import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  profileActionButtonClass,
  profileSocialStandingToggleClass,
  profileSocialStandingToggleStateClass,
} from '@/components/ui/profile-action-pill';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { useSeasonZeroClaimActions } from '@/features/season/season-zero-claim-actions';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { seasonSettlementPoolSummary } from '@/features/season/season-zero-settlement-copy';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

function seasonCollectAriaLabel(amountLabel: string): string {
  return `Collect ${amountLabel} SOCIAL season reward`;
}

function SeasonCollectButtonLabel({
  amountLabel,
  pending,
  showSocialSuffix = true,
}: {
  amountLabel: string;
  pending: boolean;
  showSocialSuffix?: boolean;
}) {
  return (
    <span className={profileSocialStandingToggleClass}>
      <span
        className={cn(
          profileSocialStandingToggleStateClass,
          'justify-center gap-1',
          pending && 'invisible'
        )}
        aria-hidden={pending}
      >
        Collect {amountLabel}
        {showSocialSuffix ? ' SOCIAL' : null}
      </span>
      <span
        className={cn(
          profileSocialStandingToggleStateClass,
          'justify-center text-current opacity-70',
          !pending && 'invisible'
        )}
        aria-hidden={!pending}
      >
        <PulsingDots size="sm" />
      </span>
    </span>
  );
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
  /** `rally` — footer pill on season page. `profile` — gold pill beside Support. */
  variant?: 'rally' | 'profile';
  /** Published settlement summary — pool context beside collect on rally page. */
  settlement?: SeasonZeroSettlementSummary | null;
  className?: string;
}) {
  const {
    handleClaim,
    isButtonVisible,
    isButtonLoading,
    isCollectSettled,
    txResult,
    clearTxResult,
  } = useSeasonZeroClaimActions({ claim, onClaimed });
  const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);
  const ariaLabel = seasonCollectAriaLabel(amountLabel);
  const showRallyCollectRow =
    variant === 'rally' && (isButtonVisible || Boolean(settlement));

  if (isCollectSettled) {
    return (
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
    );
  }

  const button =
    variant === 'profile' ? (
      <button
        type="button"
        className={cn(profileActionButtonClass('gold'), className)}
        disabled={isButtonLoading}
        aria-busy={isButtonLoading || undefined}
        aria-label={ariaLabel}
        onClick={() => void handleClaim()}
      >
        <Gift className="h-3 w-3 shrink-0" />
        <SeasonCollectButtonLabel
          amountLabel={amountLabel}
          pending={isButtonLoading}
        />
      </button>
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
      ) : isButtonVisible ? (
        button
      ) : null}
    </>
  );
}
