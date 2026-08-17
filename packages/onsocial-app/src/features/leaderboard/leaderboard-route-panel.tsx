'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import {
  APP_HOME_PATH,
  LEADERBOARD_TRACK_PARAM,
  leaderboardPath,
  parseLeaderboardTrackParam,
} from '@/lib/app-routes';
import type { LeaderboardTrack } from '@/lib/leaderboard';

/**
 * First-class `/leaderboard` destination — same slide-over as chart entries.
 * Underlay registers the OS portal host; close restores history.
 */
export function LeaderboardRoutePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const track = parseLeaderboardTrackParam(
    searchParams.get(LEADERBOARD_TRACK_PARAM)
  ) as LeaderboardTrack;
  const [open, setOpen] = useState(true);

  const handleTrackChange = useCallback(
    (next: LeaderboardTrack) => {
      router.replace(leaderboardPath({ track: next }), { scroll: false });
    },
    [router]
  );

  const handleClosed = useCallback(() => {
    setOpen(false);
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(APP_HOME_PATH);
  }, [router]);

  return (
    <>
      <OsAppScreen
        title="Leaderboard"
        subtitle="Protocol rankings"
        backFallbackHref={APP_HOME_PATH}
        glassChrome
      >
        <p className="leaderboard-route-underlay">
          Protocol reputation, influence, and earners.
        </p>
      </OsAppScreen>
      <LeaderboardSheet
        open={open}
        onClose={handleClosed}
        track={track}
        onTrackChange={handleTrackChange}
        initialTrack={track}
      />
    </>
  );
}
