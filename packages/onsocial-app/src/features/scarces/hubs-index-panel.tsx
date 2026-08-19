'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
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

function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function HubMineCard({ app }: { app: AppView }) {
  const meta =
    hubCategoryLabel(app.category) ??
    (app.categories[0]
      ? (hubCategoryLabel(app.categories[0]) ?? app.categories[0])
      : null) ??
    'Hub';
  return (
    <Link
      href={appPath(app.appId)}
      className="launcher-mine-card"
      scroll={false}
      aria-label={app.title}
    >
      <span className="launcher-mine-crest" aria-hidden>
        {app.mediaUrl ? (
          <img src={app.mediaUrl} alt="" />
        ) : (
          <span className="launcher-mine-crest-fallback">
            {monogram(app.title)}
          </span>
        )}
      </span>
      <span className="launcher-mine-card-copy">
        <span className="launcher-mine-card-title">{app.title}</span>
        <span className="launcher-mine-card-meta">{meta}</span>
      </span>
    </Link>
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
            <p className="launcher-home-empty">
              Connect to see hubs you’ve joined — or tap search to explore.
            </p>
          ) : loadError ? (
            <div className="launcher-home-empty-block">
              <p className="launcher-home-empty">{loadError}</p>
              <button
                type="button"
                className="launcher-home-retry"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          ) : !myHubsReady ? (
            <p className="launcher-home-empty">Loading your hubs…</p>
          ) : myHubs.length === 0 ? (
            <p className="launcher-home-empty">
              You haven’t joined a hub yet. Tap Search to explore, or + to start
              one.
            </p>
          ) : (
            <div className="launcher-mine-rail" role="list">
              {myHubs.map((app) => (
                <div key={app.appId} role="listitem">
                  <HubMineCard app={app} />
                </div>
              ))}
            </div>
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
