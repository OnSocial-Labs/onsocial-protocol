'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ARCHIVED_GENESIS_SEASON_ID,
  getActiveSeasonId,
  getSeasonPresentation,
  type SeasonPresentation,
  seasonApiPath,
} from '@/lib/active-season';
import { cn } from '@/lib/utils';

interface SeasonMeResponse {
  success?: boolean;
  standing?: {
    rank: number;
    score: number;
    eligible?: boolean;
  } | null;
}

export interface SeasonProfileBadge {
  rank: number;
  score: number;
}

function useSeasonProfileBadge(
  seasonId: string,
  accountId: string | null,
  enabled: boolean
): SeasonProfileBadge | null {
  const [badge, setBadge] = useState<SeasonProfileBadge | null>(null);

  useEffect(() => {
    if (!enabled || !accountId) return;

    let cancelled = false;

    void fetch(
      `${seasonApiPath(seasonId, 'me')}?account_id=${encodeURIComponent(accountId)}`,
      { cache: 'no-store' }
    )
      .then((response) => response.json() as Promise<SeasonMeResponse>)
      .then((data) => {
        if (cancelled) return;
        const standing = data.standing;
        if (standing?.eligible !== false && standing?.rank) {
          setBadge({ rank: standing.rank, score: standing.score });
          return;
        }
        setBadge(null);
      })
      .catch(() => {
        if (!cancelled) setBadge(null);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, enabled, seasonId]);

  if (!enabled || !accountId) return null;

  return badge;
}

export function useSeasonZeroProfileBadge(
  accountId: string | null,
  enabled: boolean
): SeasonProfileBadge | null {
  return useSeasonProfileBadge(ARCHIVED_GENESIS_SEASON_ID, accountId, enabled);
}

export function useActiveSeasonProfileBadge(
  accountId: string | null,
  enabled: boolean
): SeasonProfileBadge | null {
  return useSeasonProfileBadge(getActiveSeasonId(), accountId, enabled);
}

function rallyBadgeLabel(
  presentation: SeasonPresentation,
  rank?: number | null
): string {
  if (rank && rank > 0) {
    return `${presentation.profileBadgeLabel} · #${rank}`;
  }
  return presentation.profileBadgeLabel;
}

export function RallyParticipantBadge({
  presentation,
  rank,
  className,
  link = true,
  variant = 'default',
}: {
  presentation: SeasonPresentation;
  rank?: number | null;
  className?: string;
  link?: boolean;
  variant?: 'default' | 'archive';
}) {
  const label = rallyBadgeLabel(presentation, rank);

  const badge = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-px portal-type-caption font-medium',
        variant === 'archive'
          ? 'border-border/45 bg-muted/20 text-muted-foreground'
          : 'portal-gold-badge text-[var(--portal-gold)]',
        className
      )}
    >
      {label}
    </span>
  );

  if (!link) return badge;

  return (
    <Link
      href={presentation.rallyPath}
      className="inline-flex transition-opacity hover:opacity-90"
    >
      {badge}
    </Link>
  );
}

export function GenesisRallyParticipantBadge({
  rank,
  className,
  link = true,
}: {
  rank?: number | null;
  className?: string;
  link?: boolean;
}) {
  return (
    <RallyParticipantBadge
      presentation={getSeasonPresentation(ARCHIVED_GENESIS_SEASON_ID)}
      rank={rank}
      className={className}
      link={link}
      variant="archive"
    />
  );
}

export function ActiveRallyParticipantBadge({
  rank,
  className,
  link = true,
}: {
  rank?: number | null;
  className?: string;
  link?: boolean;
}) {
  return (
    <RallyParticipantBadge
      presentation={getSeasonPresentation(getActiveSeasonId())}
      rank={rank}
      className={className}
      link={link}
    />
  );
}
