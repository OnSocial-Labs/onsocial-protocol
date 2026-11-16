'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { OsAppChromePage } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsRouteSettle } from '@/components/app/os-route-settle';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import {
  DiscoverHeaderTabs,
  DiscoverNavSearch,
} from '@/features/discover/discover-screen-chrome';
import { DiscoverMovingLandingSkeleton } from '@/features/discover/discover-trending-panel';
import { isMovingLandingPainted } from '@/lib/discover-moving';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { APP_HOME_PATH } from '@/lib/app-routes';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';

function DiscoverPageScreen({
  scrollRootRef,
  backFallbackHref,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
  /** Cold open only. In the tab, Back pops the screen you left. */
  backFallbackHref: string;
}) {
  const router = useRouter();
  const popInApp = useOsInAppPop();
  const { tab, initialTrending } = useDiscoverPanel();
  // Chosen once for this route mount. A tab change must not swap the wrapper.
  const [settleMoving] = useState(
    () => tab === 'trending' && isMovingLandingPainted(initialTrending)
  );
  const onDockBack = useCallback(() => {
    if (popInApp()) return;
    router.push(backFallbackHref);
  }, [backFallbackHref, popInApp, router]);

  return (
    <OsAppScreen
      title="Discover"
      compactChrome
      glassChrome
      scrollTuck="search"
      scrollRootRef={scrollRootRef}
      leading={null}
      dockBack
      onDockBack={onDockBack}
      backFallbackHref={backFallbackHref}
      heading={<DiscoverNavSearch />}
      toolbar={<DiscoverHeaderTabs />}
    >
      <OsRouteSettle
        settle={settleMoving}
        skeleton={
          <OsAppChromePage className="discover-panel">
            <DiscoverMovingLandingSkeleton />
          </OsAppChromePage>
        }
      >
        <DiscoverPanelContent />
      </OsRouteSettle>
    </OsAppScreen>
  );
}

export function DiscoverPagePanel({
  backFallbackHref,
  initialPage = null,
  initialTrending = null,
  initialGuilds = null,
}: {
  /**
   * Dock leave parent. Portfolio `/@account/discover` → that portfolio;
   * app `/discover` → Home (same as Market).
   */
  backFallbackHref?: string;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  initialGuilds?: GuildSummaryCardModel[] | null;
}) {
  const scrollRootRef = useRef<HTMLElement>(null);
  const leaveHref = backFallbackHref ?? APP_HOME_PATH;

  return (
    <DiscoverPanelRoot
      shellVariant="page"
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
      initialTrending={initialTrending}
      initialGuilds={initialGuilds}
    >
      <DiscoverPageScreen
        scrollRootRef={scrollRootRef}
        backFallbackHref={leaveHref}
      />
    </DiscoverPanelRoot>
  );
}
