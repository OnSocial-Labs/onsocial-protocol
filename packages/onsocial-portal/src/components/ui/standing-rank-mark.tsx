'use client';

import { Crown, User } from 'lucide-react';
import {
  STANDING_RANK_PODIUM,
  standingRankTone,
  type StandingRankTone,
} from '@/lib/standing-rank-tone';
import { cn } from '@/lib/utils';

function podiumStyle(tone: StandingRankTone) {
  return tone === 'neutral' ? null : STANDING_RANK_PODIUM[tone];
}

export function StandingAvatarFrame({
  avatarUrl,
  rank,
}: {
  avatarUrl: string | null;
  rank: number;
}) {
  const tone = standingRankTone(rank);
  const podium = podiumStyle(tone);

  return (
    <div className="relative h-9 w-9 shrink-0">
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border/45 bg-muted/30 text-muted-foreground ring-offset-2 ring-offset-background transition-shadow group-hover/row:shadow-sm',
          podium
            ? podium.ring
            : 'group-hover/row:ring-1 group-hover/row:ring-foreground/15'
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-4 w-4" strokeWidth={2} />
        )}
      </div>
      <span
        className={cn(
          'absolute bottom-0 left-1/2 z-10 flex h-3.5 min-w-3.5 -translate-x-1/2 translate-y-px items-center justify-center rounded-full px-0.5 font-mono text-[9px] font-bold leading-none tabular-nums ring-1 ring-background',
          podium
            ? cn(podium.badge, podium.ink)
            : 'border border-border/50 bg-muted text-muted-foreground'
        )}
        aria-label={`Rank ${rank}`}
      >
        {rank === 1 ? (
          <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
        ) : (
          rank
        )}
      </span>
    </div>
  );
}

export function CompactStandingRankMark({ rank }: { rank: number }) {
  const tone = standingRankTone(rank);
  const podium = podiumStyle(tone);

  if (!podium) {
    return (
      <span
        className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted px-0.5 font-mono text-[9px] font-semibold leading-none tabular-nums text-muted-foreground"
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-0.5 font-mono text-[9px] font-bold leading-none tabular-nums',
        podium.chip,
        podium.ink
      )}
      aria-label={`Rank ${rank}`}
    >
      {rank === 1 ? <Crown className="h-2.5 w-2.5" strokeWidth={2.5} /> : rank}
    </span>
  );
}
