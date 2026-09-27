'use client';

import { useCallback, useRef, useState } from 'react';
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
 * First-class `/leaderboard` destination — same appear page sheet as chart entries.
 * Underlay registers the OS portal host; close leaves to Home.
 */
export function LeaderboardRoutePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const track = parseLeaderboardTrackParam(
    searchParams.get(LEADERBOARD_TRACK_PARAM)
  ) as LeaderboardTrack;
  const [open, setOpen] = useState(true);
  const rowNavigateRef = useRef(false);

  const handleTrackChange = useCallback(
    (next: LeaderboardTrack) => {
      router.replace(leaderboardPath({ track: next }), { scroll: false });
    },
    [router]
  );

  const handleRowNavigate = useCallback(() => {
    rowNavigateRef.current = true;
  }, []);

  const handleClosed = useCallback(() => {
    setOpen(false);
    if (rowNavigateRef.current) {
      rowNavigateRef.current = false;
      return;
    }
    router.push(APP_HOME_PATH);
  }, [router]);

  return (
    <>
      <OsAppScreen
        title="Leaderboard"
        leading={null}
        glassChrome
        compactChrome
        dockBack
        backFallbackHref={APP_HOME_PATH}
      >
        <p className="leaderboard-route-underlay">
          Protocol reputation, influence, and earners.
        </p>
      </OsAppScreen>
      <LeaderboardSheet
        open={open}
        onClose={handleClosed}
        onRowNavigate={handleRowNavigate}
        track={track}
        onTrackChange={handleTrackChange}
        initialTrack={track}
      />
    </>
  );
}
