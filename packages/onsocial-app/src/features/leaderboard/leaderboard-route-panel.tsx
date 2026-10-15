'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { LeaderboardSheet } from '@/features/leaderboard/leaderboard-sheet';
import { APP_HOME_PATH, leaderboardPath } from '@/lib/app-routes';
import type { LeaderboardTrack } from '@/lib/leaderboard';

/**
 * First-class `/leaderboard` destination — same appear page sheet as chart entries.
 * Track lives here so a chip does not suspend the page (that remounted the sheet
 * and snapped the pager after the next list loaded). The URL still updates.
 * Underlay registers the OS portal host; close leaves to Home.
 */
export function LeaderboardRoutePanel({
  initialTrack,
}: {
  initialTrack: LeaderboardTrack;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [track, setTrack] = useState(initialTrack);
  const rowNavigateRef = useRef(false);

  const handleTrackChange = useCallback((next: LeaderboardTrack) => {
    setTrack(next);
    const path = leaderboardPath({ track: next });
    window.history.replaceState(null, '', path);
  }, []);

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
