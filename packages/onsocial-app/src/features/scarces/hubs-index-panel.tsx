'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherMineCard,
  LauncherMineRail,
} from '@/components/launcher-home';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchPublishableApps,
  type AppView,
} from '@/features/scarces/apps-data';
import { HubsLatestDropsPanel } from '@/features/scarces/hubs-latest-drops-panel';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { APP_APP_CREATE_PATH, appPath } from '@/lib/app-routes';

function hubMeta(app: AppView): string {
  return (
    hubCategoryLabel(app.category) ??
    (app.categories[0]
      ? (hubCategoryLabel(app.categories[0]) ?? app.categories[0])
      : null) ??
    'Hub'
  );
}

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
      subtitle="Your stores"
      backFallbackHref="/"
      glassChrome
      actions={headerActions}
    >
      <div className="launcher-home">
        <section className="launcher-home-section" aria-label="My Hubs">
          <h2 className="launcher-home-heading">My Hubs</h2>
          {!accountId ? (
            <LauncherHomeEmpty>
              Connect to see hubs you’ve joined — or tap search to explore.
            </LauncherHomeEmpty>
          ) : loadError ? (
            <LauncherHomeError
              message={loadError}
              onRetry={() => setRetryKey((value) => value + 1)}
            />
          ) : !myHubsReady ? (
            <LauncherHomeEmpty>Loading your hubs…</LauncherHomeEmpty>
          ) : myHubs.length === 0 ? (
            <LauncherHomeEmpty>
              You haven’t joined a hub yet. Tap Search to explore, or + to start
              one.
            </LauncherHomeEmpty>
          ) : (
            <LauncherMineRail>
              {myHubs.map((app) => (
                <LauncherMineCard
                  key={app.appId}
                  href={appPath(app.appId)}
                  title={app.title}
                  meta={hubMeta(app)}
                  imageUrl={app.mediaUrl}
                />
              ))}
            </LauncherMineRail>
          )}
        </section>

        {showDrops ? (
          <>
            <Divider className="launcher-home-divider" />
            <section className="launcher-home-section" aria-label="Drops">
              <h2 className="launcher-home-heading">Drops</h2>
              <HubsLatestDropsPanel accountId={accountId} myHubs={myHubs} />
            </section>
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
