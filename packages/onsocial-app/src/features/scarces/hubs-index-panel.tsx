'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import {
  LauncherHomeMineStatus,
  LauncherHomeSection,
  LauncherMineCard,
  LauncherMineRail,
  LauncherMineRailSkeleton,
} from '@/components/launcher-home';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { LAUNCHER_HOME_PAGE_CLASS } from '@/lib/os-chrome-page';
import { useShellHomeMessage } from '@/lib/use-shell';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchPublishableApps,
  type AppView,
} from '@/features/scarces/apps-data';
import { HubsLatestDropsPanel } from '@/features/scarces/hubs-latest-drops-panel';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { APP_APP_CREATE_PATH, appPath } from '@/lib/app-routes';
import {
  readLauncherMineSession,
  writeLauncherMineSession,
} from '@/lib/launcher-mine-session';

/**
 * Hubs launcher — one Home: mine (horizontal) + latest drops under a divider.
 * Network catalog find: header search → Discover → Hubs.
 */
export function HubsIndexPanel() {
  const { accountId } = useAppWallet();
  const t = useTranslations('shell');
  const [myHubs, setMyHubs] = useState<AppView[] | null>(() =>
    readLauncherMineSession('hubs', accountId)
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const shownError = useShellHomeMessage(loadError ?? '');
  const [retryKey, setRetryKey] = useState(0);
  const accountIdRef = useRef(accountId);
  const myHubsRef = useRef(myHubs);

  useEffect(() => {
    accountIdRef.current = accountId;
    myHubsRef.current = myHubs;
  }, [accountId, myHubs]);

  useEffect(() => {
    return () => {
      writeLauncherMineSession({
        kind: 'hubs',
        accountId: accountIdRef.current,
        items: myHubsRef.current,
      });
    };
  }, []);

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
    const restored = readLauncherMineSession<AppView>('hubs', accountId);
    queueMicrotask(() => {
      if (cancelled) return;
      setMyHubs(restored);
      setLoadError(null);
    });
    void fetchPublishableApps(accountId, { limit: 24 })
      .then((rows) => {
        if (cancelled) return;
        setMyHubs(rows);
        writeLauncherMineSession({
          kind: 'hubs',
          accountId,
          items: rows,
        });
        setLoadError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
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
      <OsIconAction asChild ariaLabel={t('homeChrome.discoverHubs')}>
        <Link href={discoverHubsHref} scroll={false}>
          <SearchIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
      <OsIconAction asChild ariaLabel={t('homeChrome.openHub')}>
        <Link href={APP_APP_CREATE_PATH} scroll={false}>
          <PlusIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
    </>
  );

  return (
    <OsAppScreen
      title={t('apps.hubs')}
      dockBack
      backFallbackHref={OS_INDEX_LEAVE_HREF}
      glassChrome
      actions={headerActions}
    >
      <div className={LAUNCHER_HOME_PAGE_CLASS}>
        <LauncherHomeSection aria-label={t('homeChrome.myHubs')}>
          <LauncherHomeMineStatus
            connected={Boolean(accountId)}
            loading={!myHubsReady}
            error={loadError ? shownError : null}
            onRetry={() => setRetryKey((value) => value + 1)}
            emptyLoggedOut={t('homeEmpty.hubsLoggedOut')}
            emptyNone={t('homeEmpty.hubsNone')}
            loadingLabel={t('homeEmpty.hubsLoading')}
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
            <LauncherHomeSection title={t('homeChrome.latest')}>
              <HubsLatestDropsPanel accountId={accountId} myHubs={myHubs} />
            </LauncherHomeSection>
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
