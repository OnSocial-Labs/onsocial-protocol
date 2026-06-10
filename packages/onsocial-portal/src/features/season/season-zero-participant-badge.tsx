'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GENESIS_SEASON_ID } from '@/lib/genesis-season';
import { cn } from '@/lib/utils';

interface SeasonZeroMeResponse {
  success?: boolean;
  standing?: {
    rank: number;
    score: number;
    eligible?: boolean;
  } | null;
}

export interface SeasonZeroProfileBadge {
  rank: number;
  score: number;
}

export function useSeasonZeroProfileBadge(
  accountId: string | null,
  enabled: boolean
): SeasonZeroProfileBadge | null {
  const [badge, setBadge] = useState<SeasonZeroProfileBadge | null>(null);

  useEffect(() => {
    if (!enabled || !accountId) return;

    let cancelled = false;

    void fetch(
      `/api/seasons/${GENESIS_SEASON_ID}/me?account_id=${encodeURIComponent(accountId)}`,
      { cache: 'no-store' }
    )
      .then((response) => response.json() as Promise<SeasonZeroMeResponse>)
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
  }, [accountId, enabled]);

  if (!enabled || !accountId) return null;

  return badge;
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
  const label = rank && rank > 0 ? `Genesis Rally · #${rank}` : 'Genesis Rally';

  const badge = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-px portal-type-caption font-medium portal-gold-badge text-[var(--portal-gold)]',
        className
      )}
    >
      {label}
    </span>
  );

  if (!link) return badge;

  return (
    <Link
      href="/season-zero"
      className="inline-flex transition-opacity hover:opacity-90"
    >
      {badge}
    </Link>
  );
}
