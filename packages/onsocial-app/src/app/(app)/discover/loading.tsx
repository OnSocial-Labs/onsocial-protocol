import { Suspense } from 'react';
import Link from 'next/link';
import { OnSocialMark, OsAppChromePage, OsAppChromeToolbarRail } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';
import { DiscoverMovingLandingSkeleton } from '@/features/discover/discover-trending-panel';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';
import { APP_EVENTS_PATH, APP_HOME_PATH } from '@/lib/app-routes';

/**
 * Static shell for the suspense boundary. The tabbed panel reads the URL,
 * which cannot run in the prerender itself.
 */
function DiscoverLoadingShell() {
  return (
    <OsAppScreen
      title="Discover"
      compactChrome
      glassChrome
      scrollTuck="search"
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
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
          <Link href={APP_EVENTS_PATH} scroll={false} className="os-surface-chip">
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

/** Cold leave from another route. The panel paints its own section skeletons. */
export default function DiscoverLoading() {
  return (
    <Suspense fallback={<DiscoverLoadingShell />}>
      <DiscoverPagePanel placeholder />
    </Suspense>
  );
}
