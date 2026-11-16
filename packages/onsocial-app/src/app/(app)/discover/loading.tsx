'use client';

import { Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  OnSocialMark,
  OsAppChromePage,
  OsAppChromeToolbarRail,
} from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesNowPlayingDockChip } from '@/components/os/collectibles-now-playing-dock-chip';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';
import {
  DiscoverCommunityListSkeleton,
  DiscoverFocusListSkeleton,
} from '@/features/discover/discover-loading-skeleton';
import { DiscoverMovingLandingSkeleton } from '@/features/discover/discover-trending-panel';
import {
  DISCOVER_TAB_QUERY_KEY,
  parseDiscoverTab,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';
import { useSummonDockOccupiedHeight } from '@/hooks/use-summon-dock-occupied-height';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
import { APP_EVENTS_PATH, APP_HOME_PATH } from '@/lib/app-routes';
import { OsDockPill } from '@/components/wallet/os-dock-pill';
import { OsDockBackZone } from '@/components/wallet/os-dock-back-zone';

/**
 * Same rest dock the loaded page paints, including the back segment, so the
 * 1280 pill does not grow when the route settles. Not interactive.
 */
function DiscoverLoadingDock() {
  const ref = useRef<HTMLDivElement>(null);
  const { moodId, style } = useViewerDockMood();
  useSummonDockOccupiedHeight(ref, true);
  return (
    <div
      ref={ref}
      className="portfolio-summon-dock"
      data-mood={moodId ?? undefined}
      style={style}
      aria-hidden
      inert
    >
      <OsDockPill
        navBack={<OsDockBackZone fallbackHref={APP_HOME_PATH} />}
        grip={
          <span className="portfolio-summon-grip-zone">
            <span className="portfolio-summon-grip" />
          </span>
        }
        nowPlaying={<CollectiblesNowPlayingDockChip />}
      />
    </div>
  );
}

function DiscoverLoadingBody({ tab }: { tab: DiscoverTab }) {
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

/** Cold leave. Chrome and the requested tab's skeleton — no fetch, query rewrite, or session. */
function DiscoverLoadingScreen({ tab }: { tab: DiscoverTab }) {
  return (
    <OsAppScreen
      title="Discover"
      compactChrome
      glassChrome
      scrollTuck="search"
      leading={null}
      dockBack
      backFallbackHref={APP_HOME_PATH}
      dock={<DiscoverLoadingDock />}
      heading={
        <div className="discover-omni-search">
          <OsAppChromeNavSearch
            value=""
            onValueChange={() => undefined}
            placeholder="Search"
            ariaLabel="Search"
            clearAriaLabel="Clear search"
            idleClassName="discover-nav-search-field"
            leadingIcon={
              <OnSocialMark
                className="search-field-icon discover-nav-search-mark"
                aria-hidden
              />
            }
          />
        </div>
      }
      toolbar={
        <OsAppChromeToolbarRail className="discover-header-toolbar">
          <DiscoverTabBar
            tab={tab}
            onTabChange={() => undefined}
            className="discover-tab-bar--header"
          />
          <Link
            href={APP_EVENTS_PATH}
            scroll={false}
            className="os-surface-chip"
          >
            Events
          </Link>
        </OsAppChromeToolbarRail>
      }
    >
      <OsAppChromePage
        className="discover-panel"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="sr-only">Loading Discover…</p>
        <DiscoverLoadingBody tab={tab} />
      </OsAppChromePage>
    </OsAppScreen>
  );
}

function DiscoverLoadingFromSearch() {
  const tab = parseDiscoverTab(
    useSearchParams().get(DISCOVER_TAB_QUERY_KEY)
  );
  return <DiscoverLoadingScreen tab={tab} />;
}

/** Same `Suspense fallback={null}` the Discover page uses around search params. */
export default function DiscoverLoading() {
  return (
    <Suspense fallback={null}>
      <DiscoverLoadingFromSearch />
    </Suspense>
  );
}
