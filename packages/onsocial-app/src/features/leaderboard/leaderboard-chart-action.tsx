'use client';

import Link from 'next/link';
import {
  ChartFillIcon,
  OsIconAction,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import { leaderboardPath, type LeaderboardTrackParam } from '@/lib/app-routes';

/** Shared header chart control — navigates to `/leaderboard`. */
export function LeaderboardChartAction({
  track = 'reputation',
  ariaLabel = 'Open leaderboard',
}: {
  track?: LeaderboardTrackParam;
  ariaLabel?: string;
}) {
  return (
    <OsIconAction ariaLabel={ariaLabel} asChild>
      <Link href={leaderboardPath({ track })} scroll={false}>
        <ChartFillIcon
          className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
          aria-hidden
        />
      </Link>
    </OsIconAction>
  );
}
