'use client';

import { useCallback, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import {
  ChartFillIcon,
  OsIconAction,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import { leaderboardPath, type LeaderboardTrackParam } from '@/lib/app-routes';

function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

/** Shared header chart control — stacks the board; cmd/ctrl-click opens `/leaderboard`. */
export function LeaderboardChartAction({
  track = 'reputation',
  ariaLabel = 'Open leaderboard',
}: {
  track?: LeaderboardTrackParam;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const href = leaderboardPath({ track });

  const handleClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    setOpen(true);
  }, []);

  return (
    <>
      <OsIconAction ariaLabel={ariaLabel} asChild>
        <Link href={href} scroll={false} onClick={handleClick}>
          <ChartFillIcon
            className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
            aria-hidden
          />
        </Link>
      </OsIconAction>
      <LeaderboardSheet
        open={open}
        onClose={() => setOpen(false)}
        initialTrack={track}
      />
    </>
  );
}
