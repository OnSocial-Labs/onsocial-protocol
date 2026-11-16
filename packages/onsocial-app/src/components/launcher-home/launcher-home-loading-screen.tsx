'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { LauncherHomeSection } from '@/components/launcher-home/launcher-home-section';
import { LauncherMineRailSkeleton } from '@/components/launcher-home/launcher-mine-card';
import { LAUNCHER_HOME_PAGE_CLASS } from '@/lib/os-chrome-page';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';

/** Route `loading.tsx` shell for Guilds / DAOs / Hubs launcher indexes. */
export function LauncherHomeLoadingScreen({
  title,
  loadingLabel,
}: {
  title: string;
  loadingLabel: string;
}) {
  return (
    <OsAppScreen
      title={title}
      dockBack
      backFallbackHref={OS_INDEX_LEAVE_HREF}
      glassChrome
    >
      <div
        className={LAUNCHER_HOME_PAGE_CLASS}
        aria-busy="true"
        aria-live="polite"
      >
        <p className="sr-only">{loadingLabel}</p>
        <LauncherHomeSection aria-label={title}>
          <LauncherMineRailSkeleton count={4} />
        </LauncherHomeSection>
      </div>
    </OsAppScreen>
  );
}
