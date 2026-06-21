'use client';

import { Gift } from 'lucide-react';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useSeasonZeroClaimActions } from '@/features/season/season-zero-claim-actions';
import type { SeasonZeroClaimMetricsStatus } from '@/features/season/season-zero-claim-copy';
import {
  SEASON_COLLECT_ACTION_ROW_CLASS,
  SEASON_COLLECT_AMOUNT_ROW_CLASS,
  SEASON_COLLECT_SECTION_MIN_CLASS,
  SEASON_PANEL_DIVIDER_CLASS,
} from '@/features/season/season-page-column';
import { seasonSettlementPoolSummary } from '@/features/season/season-zero-settlement-copy';
import type {
  SeasonZeroClaimRecord,
  SeasonZeroLifecyclePhase,
  SeasonZeroSettlementSummary,
} from '@/features/season/season-zero-types';
import { isSeasonSettlementPublished } from '@/features/season/season-zero-types';
import { formatGenesisSocialBalanceDisplay } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

function claimStatusAccentClass(statusLabel: string): string {
  if (statusLabel === 'Collected') {
    return 'portal-gold-text';
  }
  if (statusLabel.endsWith(' SOCIAL')) {
    return 'portal-green-text';
  }
  switch (statusLabel) {
    case 'Reward ready':
    case 'Claims opening soon':
    case 'Rewards finalized':
      return 'portal-green-text';
    case 'Awaiting publish':
    case 'Awaiting settlement':
      return 'portal-blue-text';
    default:
      return 'text-muted-foreground/80';
  }
}

export function RallyCollectSection({
  phase,
  claim,
  settlement = null,
  claimStatus = null,
  claimStatusPending = false,
  onClaimed,
  className,
}: {
  phase: SeasonZeroLifecyclePhase | null;
  claim: SeasonZeroClaimRecord | null;
  settlement?: SeasonZeroSettlementSummary | null;
  claimStatus?: SeasonZeroClaimMetricsStatus | null;
  claimStatusPending?: boolean;
  onClaimed?: () => void;
  className?: string;
}) {
  const showCollectHero =
    phase === 'claim_open' && Boolean(claim && claim.claimed === false);

  const {
    handleClaim,
    isButtonVisible,
    isButtonLoading,
    isCollectSettled,
    txResult,
    clearTxResult,
  } = useSeasonZeroClaimActions({
    claim: showCollectHero ? claim : null,
    onClaimed,
  });

  const publishedSettlement =
    settlement && isSeasonSettlementPublished(settlement) ? settlement : null;
  const poolSummary = publishedSettlement
    ? seasonSettlementPoolSummary(publishedSettlement)
    : null;

  if (claimStatusPending) {
    return (
      <div
        className={cn(
          'px-3 py-2.5 text-center sm:px-3.5 sm:py-3',
          SEASON_COLLECT_SECTION_MIN_CLASS,
          SEASON_PANEL_DIVIDER_CLASS,
          className
        )}
      >
        <Skeleton className="mx-auto h-3 w-28 rounded-full bg-foreground/[0.06]" />
        <div
          className={cn(
            'mt-2 flex justify-center',
            SEASON_COLLECT_AMOUNT_ROW_CLASS
          )}
        >
          <Skeleton className="h-9 w-32 rounded-full bg-foreground/[0.06] sm:h-10 sm:w-36" />
        </div>
        <div
          className={cn(
            'mt-2 flex justify-center',
            SEASON_COLLECT_ACTION_ROW_CLASS
          )}
        >
          <Skeleton className="h-9 w-[8rem] rounded-full bg-foreground/[0.06]" />
        </div>
      </div>
    );
  }

  if (showCollectHero && claim && (isButtonVisible || isCollectSettled)) {
    const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);

    return (
      <>
        <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
        <div
          className={cn(
            'flex flex-col items-center px-3 py-2.5 text-center sm:px-3.5 sm:py-3',
            SEASON_COLLECT_SECTION_MIN_CLASS,
            SEASON_PANEL_DIVIDER_CLASS,
            className
          )}
        >
          <span className="portal-eyebrow text-muted-foreground">
            {isCollectSettled ? 'Collected' : 'Ready to collect'}
          </span>
          <div
            className={cn(
              'mt-1 flex w-full items-center justify-center',
              SEASON_COLLECT_AMOUNT_ROW_CLASS
            )}
          >
            <span className="portal-green-text font-mono text-2xl font-bold tracking-[-0.03em] tabular-nums sm:text-3xl">
              {amountLabel}
              <span className="ml-1.5 portal-type-micro uppercase tracking-wide text-muted-foreground/70">
                SOCIAL
              </span>
            </span>
          </div>
          {poolSummary ? (
            <p className="mt-1 max-w-sm portal-type-micro text-muted-foreground/75">
              {poolSummary}
            </p>
          ) : null}
          {!isCollectSettled ? (
            <div
              className={cn(
                'mt-2 flex w-full items-center justify-center',
                SEASON_COLLECT_ACTION_ROW_CLASS
              )}
            >
              <Button
                type="button"
                size="sm"
                variant="accent"
                className="min-w-[8rem] justify-center gap-1.5"
                loading={isButtonLoading}
                onClick={() => void handleClaim()}
              >
                <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Collect
              </Button>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  if (claim?.claimed) {
    const amountLabel = formatGenesisSocialBalanceDisplay(claim.amountYocto);
    const statusHref = claim.claimedTxHash
      ? (claimStatus?.statusHref ?? null)
      : null;

    return (
      <div
        className={cn(
          'px-3 py-2.5 text-center sm:px-3.5 sm:py-3',
          SEASON_PANEL_DIVIDER_CLASS,
          className
        )}
      >
        <p className="portal-eyebrow text-muted-foreground">Season reward</p>
        <p className="mt-1 font-mono text-sm font-semibold tabular-nums portal-gold-text">
          Collected {amountLabel} SOCIAL
        </p>
        {statusHref ? (
          <a
            href={statusHref}
            target="_blank"
            rel="noopener noreferrer"
            className="group/status mt-1 inline-flex items-center gap-1 portal-type-micro text-muted-foreground/75 underline-offset-2 hover:underline"
          >
            View transaction
            <ProtocolMotionArrow className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    );
  }

  if (!claimStatus) {
    return null;
  }

  const statusHref = claimStatus.statusHref ?? null;

  return (
    <div
      className={cn(
        'px-3 py-2.5 text-center sm:px-3.5 sm:py-3',
        SEASON_PANEL_DIVIDER_CLASS,
        className
      )}
    >
      <p className="portal-eyebrow text-muted-foreground">Season claim</p>
      <p className="mt-1 text-sm">
        {statusHref ? (
          <a
            href={statusHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'group/status inline-flex items-center gap-1 underline-offset-2 hover:underline',
              claimStatusAccentClass(claimStatus.statusLabel)
            )}
          >
            <span>{claimStatus.statusLabel}</span>
            <ProtocolMotionArrow className="h-3 w-3" />
          </a>
        ) : (
          <span className={claimStatusAccentClass(claimStatus.statusLabel)}>
            {claimStatus.statusLabel}
          </span>
        )}
      </p>
      {claimStatus.detailLine ? (
        <p className="mt-1 portal-type-micro text-muted-foreground/75">
          {claimStatus.detailLine}
        </p>
      ) : null}
    </div>
  );
}
