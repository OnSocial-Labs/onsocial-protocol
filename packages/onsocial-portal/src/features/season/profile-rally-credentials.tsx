'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ARCHIVED_GENESIS_SEASON_ID,
  getActiveSeasonId,
  getSeasonPresentation,
  type SeasonPresentation,
} from '@/lib/active-season';
import {
  useActiveSeasonProfileBadge,
  useSeasonZeroProfileBadge,
  type SeasonProfileBadge,
} from '@/features/season/season-zero-participant-badge';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { cn } from '@/lib/utils';

export interface ProfileRallyParticipation {
  seasonId: string;
  presentation: SeasonPresentation;
  rank: number;
  live: boolean;
}

function formatRank(rank: number): string {
  if (!Number.isFinite(rank) || rank <= 0) return '';
  return `#${new Intl.NumberFormat('en-US').format(rank)}`;
}

function buildParticipations(
  activeSeasonId: string,
  activeBadge: SeasonProfileBadge | null,
  genesisBadge: SeasonProfileBadge | null
): ProfileRallyParticipation[] {
  const items: ProfileRallyParticipation[] = [];

  if (activeBadge) {
    items.push({
      seasonId: activeSeasonId,
      presentation: getSeasonPresentation(activeSeasonId),
      rank: activeBadge.rank,
      live: true,
    });
  }

  if (genesisBadge) {
    items.push({
      seasonId: ARCHIVED_GENESIS_SEASON_ID,
      presentation: getSeasonPresentation(ARCHIVED_GENESIS_SEASON_ID),
      rank: genesisBadge.rank,
      live: false,
    });
  }

  return items;
}

export function useProfileRallyParticipations(
  accountId: string | null,
  enabled: boolean
): ProfileRallyParticipation[] {
  const activeSeasonId = getActiveSeasonId();
  const activeBadge = useActiveSeasonProfileBadge(accountId, enabled);
  const genesisBadge = useSeasonZeroProfileBadge(accountId, enabled);

  return useMemo(
    () => buildParticipations(activeSeasonId, activeBadge, genesisBadge),
    [activeBadge, activeSeasonId, genesisBadge]
  );
}

const metaChipClass =
  'group inline-flex shrink-0 items-center gap-0.5 rounded-md px-0.5 py-px transition-colors focus-visible:outline-none focus-visible:ring-1';

function MetaSeparator() {
  return (
    <span aria-hidden="true" className="select-none text-muted-foreground/30">
      ·
    </span>
  );
}

function RallyMetaChip({
  href,
  label,
  tone,
  ariaLabel,
}: {
  href: string;
  label: string;
  tone: 'live' | 'archive';
  ariaLabel: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        metaChipClass,
        tone === 'live'
          ? 'text-[var(--portal-gold)] hover:text-[var(--portal-gold)] focus-visible:ring-[var(--portal-gold-accent)]'
          : 'text-muted-foreground/55 hover:text-muted-foreground/75 focus-visible:ring-border/60'
      )}
      aria-label={ariaLabel}
    >
      {label}
      <ProtocolMotionArrow
        className={cn(
          'h-2 w-2',
          tone === 'live'
            ? 'text-[var(--portal-gold)]/70 group-hover:text-[var(--portal-gold)]'
            : 'text-muted-foreground/45 group-hover:text-muted-foreground/60'
        )}
      />
    </Link>
  );
}

function RallySeasonOverflow({
  seasons,
}: {
  seasons: ProfileRallyParticipation[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (seasons.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className={cn(
          metaChipClass,
          'text-muted-foreground/55 hover:text-muted-foreground/75 focus-visible:ring-border/60'
        )}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        +{seasons.length} seasons
        <ProtocolMotionArrow className="h-2 w-2 text-muted-foreground/45" />
      </button>
      {open ? (
        <div
          id={listId}
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[9.5rem] overflow-hidden rounded-lg border border-border/40 bg-background/95 py-1 shadow-lg backdrop-blur-sm"
        >
          {seasons.map((season) => {
            const rankLabel = formatRank(season.rank);
            return (
              <Link
                key={season.seasonId}
                href={season.presentation.rallyPath}
                role="menuitem"
                className="flex items-center justify-between gap-3 px-2.5 py-1.5 portal-type-caption transition-colors hover:bg-foreground/[0.04]"
                onClick={() => setOpen(false)}
              >
                <span className="text-muted-foreground/75">
                  {season.presentation.profileBadgeLabel}
                </span>
                {rankLabel ? (
                  <span className="tabular-nums text-muted-foreground/45">
                    {rankLabel}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ProfileRallyCredentials({
  participations,
  className,
}: {
  participations: ProfileRallyParticipation[];
  className?: string;
}) {
  if (participations.length === 0) return null;

  const live = participations.find((item) => item.live) ?? null;
  const archived = participations.filter((item) => !item.live);
  const singleArchive = archived.length === 1 ? (archived[0] ?? null) : null;
  const overflowArchives = archived.length > 1 ? archived : [];

  const liveRank = live ? formatRank(live.rank) : '';
  const liveLabel = live
    ? liveRank
      ? `${live.presentation.profileBadgeLabel} ${liveRank}`
      : live.presentation.profileBadgeLabel
    : null;

  return (
    <span
      className={cn('inline-flex min-w-0 flex-wrap items-center', className)}
    >
      {live && liveLabel ? (
        <RallyMetaChip
          href={live.presentation.rallyPath}
          label={liveLabel}
          tone="live"
          ariaLabel={`${live.presentation.pageTitle}${liveRank ? `, rank ${live.rank}` : ''}`}
        />
      ) : null}

      {singleArchive ? (
        <>
          {live ? <MetaSeparator /> : null}
          <RallyMetaChip
            href={singleArchive.presentation.rallyPath}
            label={singleArchive.presentation.profileBadgeLabel}
            tone="archive"
            ariaLabel={`${singleArchive.presentation.pageTitle} archive`}
          />
        </>
      ) : null}

      {overflowArchives.length > 0 ? (
        <>
          {live || singleArchive ? <MetaSeparator /> : null}
          <RallySeasonOverflow seasons={overflowArchives} />
        </>
      ) : null}
    </span>
  );
}
