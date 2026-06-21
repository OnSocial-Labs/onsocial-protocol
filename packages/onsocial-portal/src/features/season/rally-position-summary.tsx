'use client';

import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import { SEASON_PANEL_PADDING_CLASS } from '@/features/season/season-page-column';
import {
  StandingRow,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import { cn } from '@/lib/utils';

export function RallyPositionSummary({
  standing,
  rewardAmountYocto = null,
  payoutHint = null,
  onOpenRules,
  onJumpToStandings,
  standingPulse = false,
  className,
}: {
  standing: SeasonZeroStanding;
  rewardAmountYocto?: string | null;
  payoutHint?: string | null;
  onOpenRules?: () => void;
  onJumpToStandings?: () => void;
  standingPulse?: boolean;
  className?: string;
}) {
  const showJumpLink = Boolean(onJumpToStandings && standing.rank > 0);

  return (
    <div className={cn(SEASON_PANEL_PADDING_CLASS, className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <BoostPanelSectionTitle className="shrink-0">
            Your standing
          </BoostPanelSectionTitle>
          {showJumpLink ? (
            <>
              <span
                className="portal-eyebrow-wide text-muted-foreground/35"
                aria-hidden
              >
                ·
              </span>
              <button
                type="button"
                onClick={onJumpToStandings}
                className="portal-action-link group inline-flex items-center gap-0.5 portal-eyebrow-wide text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`View rank ${standing.rank} in standings`}
              >
                View
                <ProtocolMotionArrow direction="down" className="h-3 w-3" />
              </button>
            </>
          ) : null}
        </div>
        {onOpenRules ? (
          <button
            type="button"
            onClick={onOpenRules}
            className="shrink-0 portal-type-micro text-muted-foreground/75 transition-colors hover:text-foreground"
          >
            Rules
          </button>
        ) : null}
      </div>

      <div className="mt-2">
        <StandingRow
          standing={standing}
          rewardAmountYocto={rewardAmountYocto}
          pulse={standingPulse}
        />
      </div>

      {payoutHint ? (
        <p className="mt-2 portal-type-micro text-muted-foreground/70">
          {payoutHint}
        </p>
      ) : null}
    </div>
  );
}

export { StandingRowSkeleton as RallyPositionSummarySkeleton } from '@/features/season/season-zero-standing-row';
