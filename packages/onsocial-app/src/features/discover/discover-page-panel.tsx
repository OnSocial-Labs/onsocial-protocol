'use client';

import { useCallback, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { OsAppChromePage } from '@onsocial/ui';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsRouteSettle } from '@/components/app/os-route-settle';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import {
  DiscoverCommunityListSkeleton,
  DiscoverFocusListSkeleton,
} from '@/features/discover/discover-loading-skeleton';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
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

function DiscoverRoutePlaceholder({ tab }: { tab: DiscoverTab }) {
  if (tab === 'profiles') {
    return <ProfileSocialListSkeleton rowVariant="discover" />;
  }
  if (tab === 'daos' || tab === 'guilds' || tab === 'hubs') {
    const label =
      tab === 'daos'
        ? 'Loading DAOs…'
        : tab === 'guilds'
          ? 'Loading guilds…'
          : 'Loading hubs…';
    return <DiscoverCommunityListSkeleton label={label} />;
  }
  if (tab === 'topics' || tab === 'tickers') {
    return <DiscoverFocusListSkeleton />;
  }
  return <DiscoverMovingLandingSkeleton />;
}

function DiscoverPageScreen({
  scrollRootRef,
  backFallbackHref,
  placeholder = false,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
  /** Cold open only. In the tab, Back pops the screen you left. */
  backFallbackHref: string;
  /** Route `loading.tsx` — chrome plus the tab skeleton, no live fetch paint. */
  placeholder?: boolean;
}) {
  const router = useRouter();
  const popInApp = useOsInAppPop();
  const { tab, initialTrending } = useDiscoverPanel();
  const settleMoving =
    !placeholder &&
    tab === 'trending' &&
    isMovingLandingPainted(initialTrending);
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
      {placeholder ? (
        <OsAppChromePage className="discover-panel" aria-busy="true">
          <p className="sr-only">Loading Discover…</p>
          <DiscoverRoutePlaceholder tab={tab} />
        </OsAppChromePage>
      ) : settleMoving ? (
        <OsRouteSettle
          skeleton={
            <OsAppChromePage className="discover-panel">
              <DiscoverMovingLandingSkeleton />
            </OsAppChromePage>
          }
        >
          <DiscoverPanelContent />
        </OsRouteSettle>
      ) : (
        <DiscoverPanelContent />
      )}
    </OsAppScreen>
  );
}

export function DiscoverPagePanel({
  backFallbackHref,
  initialPage = null,
  initialTrending = null,
  initialGuilds = null,
  placeholder = false,
}: {
  /**
   * Dock leave parent. Portfolio `/@account/discover` → that portfolio;
   * app `/discover` → Home (same as Market).
   */
  backFallbackHref?: string;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  initialGuilds?: GuildSummaryCardModel[] | null;
  /** Static skeleton for route `loading.tsx`. */
  placeholder?: boolean;
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
        placeholder={placeholder}
      />
    </DiscoverPanelRoot>
  );
}
