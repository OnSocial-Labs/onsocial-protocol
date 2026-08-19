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
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { APP_APP_CREATE_PATH, appPath } from '@/lib/app-routes';

function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function HubMineCard({ app }: { app: AppView }) {
  return (
    <Link
      href={appPath(app.appId)}
      className="daos-mine-card"
      scroll={false}
      aria-label={app.title}
    >
      <span className="daos-mine-crest" aria-hidden>
        {app.mediaUrl ? (
          <img src={app.mediaUrl} alt="" />
        ) : (
          <span className="daos-mine-crest-fallback">
            {monogram(app.title)}
          </span>
        )}
      </span>
      <span className="daos-mine-card-copy">
        <span className="daos-mine-card-title">{app.title}</span>
        <span className="daos-mine-card-meta">Hub</span>
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

  const discoverHubsHref = appDiscoverTabHref('hubs');

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => setMyHubs([]));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMyHubs(null);
    });
    void fetchPublishableApps(accountId, { limit: 24 })
      .then((rows) => {
        if (!cancelled) setMyHubs(rows);
      })
      .catch(() => {
        if (!cancelled) setMyHubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const myHubsReady = myHubs !== null;
  const showMineRail = Boolean(accountId && myHubsReady && myHubs.length > 0);
  /** Drops only once you're in — no tutorial empty under the divider. */
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
      <div className="daos-index">
        <section className="daos-index-section" aria-label="My Hubs">
          <h2 className="daos-index-heading">My Hubs</h2>
          {!accountId ? (
            <p className="daos-index-empty">
              Connect to see hubs you’re in — or tap search to explore.
            </p>
          ) : !myHubsReady ? (
            <p className="daos-index-empty">Loading your hubs…</p>
          ) : myHubs.length === 0 ? (
            <p className="daos-index-empty">
              You haven’t opened a hub yet. Tap Search to explore, or + to start
              one.
            </p>
          ) : (
            <div className="daos-mine-rail" role="list">
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
            <Divider className="daos-index-divider" />
            <section className="daos-index-section" aria-label="Drops">
              <h2 className="daos-index-heading">Drops</h2>
              <HubsLatestDropsPanel accountId={accountId} myHubs={myHubs} />
            </section>
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
