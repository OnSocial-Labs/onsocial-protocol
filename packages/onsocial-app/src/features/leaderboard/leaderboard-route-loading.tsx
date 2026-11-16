'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { APP_HOME_PATH } from '@/lib/app-routes';

/** Cold `/leaderboard` — same screen chrome as `LeaderboardRoutePanel`. */
export function LeaderboardRouteLoading() {
  return (
    <OsAppScreen
      title="Leaderboard"
      leading={null}
      glassChrome
      compactChrome
      dockBack
      backFallbackHref={APP_HOME_PATH}
    >
      <p className="sr-only">Loading leaderboard…</p>
      <ProfileSocialListSkeleton count={6} rowVariant="leaderboard" />
    </OsAppScreen>
  );
}