'use client';

import type { ReactNode } from 'react';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { BoostPanelSectionTitle } from '@/features/boost/boost-panel-section-title';
import {
  RALLY_LINE_BOX_EYEBROW,
  RALLY_LINE_BOX_MICRO,
  SEASON_COLLECT_ACTION_ROW_CLASS,
  SEASON_PANEL_PADDING_CLASS,
  SEASON_STANDING_HEADER_LEFT_CLASS,
  SEASON_STANDING_HEADER_ROW_CLASS,
} from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { RallyDiscoverProfilesLink } from '@/features/season/rally-join-footer-status-line';
import {
  StandingRow,
  StandingRowSkeleton,
  type SeasonZeroStanding,
} from '@/features/season/season-zero-standing-row';
import { cn } from '@/lib/utils';

function RallyStandingHeaderDot() {
  return (
    <span className="portal-eyebrow-wide text-muted-foreground/35" aria-hidden>
      ·
    </span>
  );
}

function RallyStandingHeaderView({
  loading = false,
  onJumpToStandings,
  rank,
}: {
  loading?: boolean;
  onJumpToStandings?: () => void;
  rank?: number;
}) {
  const showJumpLink = Boolean(
    onJumpToStandings && (loading || (rank ?? 0) > 0)
  );

  if (!showJumpLink) {
    return (
      <RallyTextSlot
        lineClass={cn(RALLY_LINE_BOX_EYEBROW, 'w-[2.625rem] opacity-0')}
        aria-hidden
      />
    );
  }

  return (
    <>
      <RallyStandingHeaderDot />
      <RallyTextSlot
        lineClass={cn(
          RALLY_LINE_BOX_EYEBROW,
          'gap-0.5',
          loading && 'pointer-events-none'
        )}
        loading={loading}
        pulseClass="h-[1em] w-[1.375rem]"
      >
        <button
          type="button"
          onClick={onJumpToStandings}
          disabled={loading}
          className="portal-action-link group inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={
            rank && rank > 0 ? `View rank ${rank} in standings` : undefined
          }
        >
          View
          <ProtocolMotionArrow direction="down" className="h-3 w-3" />
        </button>
      </RallyTextSlot>
    </>
  );
}

function RallyStandingHeaderRules({
  loading = false,
  onOpenRules,
}: {
  loading?: boolean;
  onOpenRules?: () => void;
}) {
  if (!onOpenRules && !loading) {
    return (
      <RallyTextSlot
        lineClass={cn(RALLY_LINE_BOX_MICRO, 'w-9 justify-end opacity-0')}
        aria-hidden
      />
    );
  }

  return (
    <RallyTextSlot
      lineClass={cn(
        RALLY_LINE_BOX_MICRO,
        'w-9 justify-end text-muted-foreground/75',
        loading && 'pointer-events-none'
      )}
      loading={loading}
      pulseClass="h-[1em] w-6"
    >
      <button
        type="button"
        onClick={onOpenRules}
        disabled={loading}
        className="transition-colors hover:text-foreground"
      >
        Rules
      </button>
    </RallyTextSlot>
  );
}

function RallyStandingHeaderFrame({
  view,
  rules,
}: {
  view: ReactNode;
  rules: ReactNode;
}) {
  return (
    <div className={SEASON_STANDING_HEADER_ROW_CLASS}>
      <div className={SEASON_STANDING_HEADER_LEFT_CLASS}>
        <RallyTextSlot
          lineClass={cn(
            RALLY_LINE_BOX_EYEBROW,
            'shrink-0 text-muted-foreground'
          )}
        >
          <BoostPanelSectionTitle className="leading-none">
            Your standing
          </BoostPanelSectionTitle>
        </RallyTextSlot>
        {view}
      </div>
      {rules}
    </div>
  );
}

export function RallyPositionSummary({
  standing,
  rewardAmountYocto = null,
  rewardProminent = false,
  reserveRewardSlot = false,
  rewardSlotLoading = false,
  payoutHint = null,
  onOpenRules,
  onJumpToStandings,
  standingPulse = false,
  className,
}: {
  standing: SeasonZeroStanding;
  rewardAmountYocto?: string | null;
  rewardProminent?: boolean;
  reserveRewardSlot?: boolean;
  rewardSlotLoading?: boolean;
  payoutHint?: string | null;
  onOpenRules?: () => void;
  onJumpToStandings?: () => void;
  standingPulse?: boolean;
  className?: string;
}) {
  const showJumpLink = Boolean(onJumpToStandings && standing.rank > 0);

  return (
    <div className={cn(SEASON_PANEL_PADDING_CLASS, 'pb-0', className)}>
      <RallyStandingHeaderFrame
        view={
          <RallyStandingHeaderView
            onJumpToStandings={showJumpLink ? onJumpToStandings : undefined}
            rank={standing.rank}
          />
        }
        rules={<RallyStandingHeaderRules onOpenRules={onOpenRules} />}
      />

      <div className="mt-2">
        <StandingRow
          standing={standing}
          rewardAmountYocto={rewardAmountYocto}
          rewardProminent={rewardProminent}
          reserveRewardSlot={reserveRewardSlot}
          rewardSlotLoading={rewardSlotLoading}
          pulse={standingPulse}
        />
      </div>

      {payoutHint ? (
        <div className="mt-2 space-y-2">
          <p className="min-h-4 portal-type-micro text-muted-foreground/70">
            {payoutHint}
          </p>
          <div
            className={cn(
              'flex w-full items-center justify-center',
              SEASON_COLLECT_ACTION_ROW_CLASS
            )}
          >
            <RallyDiscoverProfilesLink />
          </div>
        </div>
      ) : (
        <div className="mt-2 min-h-4" aria-hidden />
      )}
    </div>
  );
}

export function RallyPositionSummarySkeleton({
  reserveRewardSlot = true,
  rewardSlotLoading = false,
  reserveHeaderLinks = true,
}: {
  reserveRewardSlot?: boolean;
  rewardSlotLoading?: boolean;
  reserveHeaderLinks?: boolean;
} = {}) {
  return (
    <div className={cn(SEASON_PANEL_PADDING_CLASS, 'pb-0')}>
      <RallyStandingHeaderFrame
        view={
          <RallyStandingHeaderView
            loading={reserveHeaderLinks}
            onJumpToStandings={reserveHeaderLinks ? () => {} : undefined}
          />
        }
        rules={
          <RallyStandingHeaderRules
            loading={reserveHeaderLinks}
            onOpenRules={reserveHeaderLinks ? () => {} : undefined}
          />
        }
      />

      <div className="mt-2">
        <StandingRowSkeleton
          reserveRewardSlot={reserveRewardSlot}
          rewardSlotLoading={rewardSlotLoading}
        />
      </div>

      <div className="mt-2 min-h-4" aria-hidden />
    </div>
  );
}
