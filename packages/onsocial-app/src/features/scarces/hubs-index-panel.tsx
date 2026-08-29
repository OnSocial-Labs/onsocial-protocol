'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import {
  LauncherHomeMineStatus,
  LauncherHomeSection,
  LauncherMineCard,
  LauncherMineRail,
  LauncherMineRailSkeleton,
} from '@/components/launcher-home';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchPublishableApps,
  type AppView,
} from '@/features/scarces/apps-data';
import { HubsLatestDropsPanel } from '@/features/scarces/hubs-latest-drops-panel';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { APP_APP_CREATE_PATH, appPath } from '@/lib/app-routes';

/**
 * Hubs launcher — one Home: mine (horizontal) + latest drops under a divider.
 * Network catalog find: header search → Discover → Hubs.
 */
export function HubsIndexPanel() {
  const { accountId } = useAppWallet();
  const [myHubs, setMyHubs] = useState<AppView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const discoverHubsHref = appDiscoverTabHref('hubs');

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => {
        setMyHubs(null);
        setLoadError(null);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setMyHubs(null);
        setLoadError(null);
      }
    });
    void fetchPublishableApps(accountId, { limit: 24 })
      .then((rows) => {
        if (cancelled) return;
        setMyHubs(rows);
        setLoadError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setMyHubs(null);
        setLoadError(
          cause instanceof Error ? cause.message : 'Could not load hubs.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, retryKey]);

  const myHubsReady = myHubs !== null;
  const showMineRail = Boolean(accountId && myHubsReady && myHubs.length > 0);
  const showDrops = showMineRail;

  const headerActions = (
    <>
      <OsIconAction asChild ariaLabel="Discover Hubs">
        <Link href={discoverHubsHref} scroll={false}>
          <SearchIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
      <OsIconAction asChild ariaLabel="Open a hub">
        <Link href={APP_APP_CREATE_PATH} scroll={false}>
          <PlusIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
    </>
  );

  return (
    <OsAppScreen
      title="Hubs"
      dockBack
      backFallbackHref="/"
      glassChrome
      actions={headerActions}
    >
      <div className="launcher-home">
        <LauncherHomeSection aria-label="My hubs">
          <LauncherHomeMineStatus
            connected={Boolean(accountId)}
            loading={!myHubsReady}
            error={loadError}
            onRetry={() => setRetryKey((value) => value + 1)}
            emptyLoggedOut="Connect to see hubs you’ve joined — or tap search to explore."
            emptyNone="You haven’t joined a hub yet. Tap Search to explore, or + to start one."
            loadingLabel="Loading your hubs…"
            loadingSkeleton={<LauncherMineRailSkeleton count={4} />}
            hasItems={(myHubs?.length ?? 0) > 0}
          >
            <LauncherMineRail>
              {(myHubs ?? []).map((app) => (
                <LauncherMineCard
                  key={app.appId}
                  href={appPath(app.appId)}
                  seedId={app.appId}
                  title={app.title}
                  bannerUrl={app.bannerUrl}
                  markUrl={app.mediaUrl}
                  markVariant="logo"
                />
              ))}
            </LauncherMineRail>
          </LauncherHomeMineStatus>
        </LauncherHomeSection>

        {showDrops ? (
          <>
            <Divider className="launcher-home-divider" />
            <LauncherHomeSection title="Latest">
              <HubsLatestDropsPanel accountId={accountId} myHubs={myHubs} />
            </LauncherHomeSection>
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
