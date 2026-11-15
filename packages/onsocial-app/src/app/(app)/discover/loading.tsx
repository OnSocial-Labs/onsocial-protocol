'use client';

import { useRef } from 'react';
import Link from 'next/link';
import {
  OnSocialMark,
  OsAppChromePage,
  OsAppChromeToolbarRail,
} from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectiblesNowPlayingDockChip } from '@/components/os/collectibles-now-playing-dock-chip';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';
import { DiscoverMovingLandingSkeleton } from '@/features/discover/discover-trending-panel';
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

/** Cold leave. Chrome and the Moving skeleton only — no fetch, query, or session. */
export default function DiscoverLoading() {
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
            tab="trending"
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
        <DiscoverMovingLandingSkeleton />
      </OsAppChromePage>
    </OsAppScreen>
  );
}
