'use client';

import { PortalBadge } from '@/components/ui/portal-badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { SeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';
import { SEASON_PANEL_PADDING_CLASS } from '@/features/season/season-page-column';
import { cn } from '@/lib/utils';

function phaseBadge(phase: SeasonZeroLifecyclePhase): {
  label: string;
  accent: 'gold' | 'blue' | 'green' | 'neutral';
} {
  switch (phase) {
    case 'upcoming':
      return { label: 'Soon', accent: 'blue' };
    case 'live':
      return { label: 'Live', accent: 'gold' };
    case 'claim_open':
      return { label: 'Claims', accent: 'green' };
    case 'published_claim_soon':
      return { label: 'Published', accent: 'green' };
    case 'ended_pending_settlement':
    case 'finalized_pending_publish':
      return { label: 'Ended', accent: 'blue' };
  }
}

export function RallyHeroHeader({
  displayTitle,
  joinEntryLabel = null,
  joinEntryLoading = false,
  phase = null,
  phaseReady = false,
  className,
}: {
  displayTitle: string;
  /** DAO-configured SOCIAL amount to join — kept in the hero for post-rally context. */
  joinEntryLabel?: string | null;
  joinEntryLoading?: boolean;
  phase?: SeasonZeroLifecyclePhase | null;
  phaseReady?: boolean;
  className?: string;
}) {
  const phasePill =
    phaseReady && phase != null ? (
      <PortalBadge
        accent={phaseBadge(phase).accent}
        size="sm"
        className="shrink-0"
      >
        {phaseBadge(phase).label}
      </PortalBadge>
    ) : (
      <Skeleton className="h-6 w-14 shrink-0 rounded-full bg-foreground/[0.06]" />
    );

  const showJoinEntry = joinEntryLoading || Boolean(joinEntryLabel);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-fade-detail',
        SEASON_PANEL_PADDING_CLASS,
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <h1 className="min-w-0 truncate portal-eyebrow-wide portal-gold-text">
          {displayTitle}
        </h1>
        {showJoinEntry ? (
          <>
            <span
              className="portal-eyebrow-wide text-muted-foreground/35"
              aria-hidden
            >
              ·
            </span>
            {joinEntryLoading ? (
              <Skeleton className="h-3.5 w-16 rounded-full bg-foreground/[0.06]" />
            ) : (
              <p className="portal-eyebrow-wide text-muted-foreground/70">
                <span className="font-mono tabular-nums text-foreground/85">
                  {joinEntryLabel}
                </span>
                <span className="ml-1">entry</span>
              </p>
            )}
          </>
        ) : null}
      </div>
      {phasePill}
    </div>
  );
}

export function RallyHeroHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-fade-detail',
        SEASON_PANEL_PADDING_CLASS,
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <Skeleton className="h-5 w-44 max-w-full rounded-full bg-foreground/[0.06] md:w-52" />
        <Skeleton className="h-3.5 w-16 rounded-full bg-foreground/[0.06]" />
      </div>
      <Skeleton className="h-6 w-14 shrink-0 rounded-full bg-foreground/[0.06]" />
    </div>
  );
}
