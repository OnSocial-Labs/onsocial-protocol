'use client';

import { useCallback, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import {
  DiscoverHeaderTabs,
  DiscoverNavSearch,
} from '@/features/discover/discover-screen-chrome';
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
      <DiscoverPanelContent />
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
