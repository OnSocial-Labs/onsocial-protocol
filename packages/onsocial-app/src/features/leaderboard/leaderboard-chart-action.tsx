'use client';

import {
  ChartFillIcon,
  OsIconAction,
  osIconActionGlyphClassName,
} from '@onsocial/ui';

/** Shared header chart control — reputation facts + boost drawers. */
export function LeaderboardChartAction({
  onClick,
  ariaLabel = 'Open leaderboard',
}: {
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <OsIconAction ariaLabel={ariaLabel} onClick={onClick}>
      <ChartFillIcon
        className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
        aria-hidden
      />
    </OsIconAction>
  );
}
