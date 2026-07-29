'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PlusIcon, osIconActionClassName } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  canCreateInApp,
  creatorAccessLabel,
  creatorAccessShort,
  fetchApp,
  isAppAuthority,
  isAppOwner,
  type AppView,
} from '@/features/scarces/apps-data';
import { AppManageSection } from '@/features/scarces/app-manage-section';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import {
  fetchCollectionsByApp,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  StoreCatalogTabs,
  StoreDropsList,
  StoreResalePanel,
  type StoreCatalogTab,
} from '@/features/scarces/store-catalog';
import { StorePublishRequestSection } from '@/features/scarces/store-publish-request-section';
import {
  APP_APPS_PATH,
  APP_DROP_CREATE_PATH,
  MARKET_APP_PARAM,
} from '@/lib/app-routes';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

/** Two-letter monogram from the store name for the logo fallback. */
function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppPagePanel({
  appId,
  initial,
}: {
  appId: string;
  initial: AppView | null;
}) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const [app, setApp] = useState<AppView | null>(initial);
  const [notFound, setNotFound] = useState(initial == null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [catalogTab, setCatalogTab] = useState<StoreCatalogTab>('drops');
  const [drops, setDrops] = useState<CollectionView[]>([]);
  const [dropsLoadedKey, setDropsLoadedKey] = useState<string | null>(null);
  const [dropsIndexerCatchUp, setDropsIndexerCatchUp] = useState(false);
  const dropsKey = `${appId}:${refreshKey}`;
  const dropsLoading = dropsLoadedKey !== dropsKey;

  useEffect(() => {
    let cancelled = false;
    void fetchApp(appId).then((next) => {
      if (cancelled) return;
      if (next) {
        setApp(next);
        setNotFound(false);
      } else if (!initial) {
        setNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appId, initial, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    setDropsIndexerCatchUp(false);

    async function load(): Promise<CollectionView[]> {
      try {
        const next = await fetchCollectionsByApp(appId, { limit: 48 });
        if (cancelled) return [];
        setDrops(next);
        setDropsLoadedKey(dropsKey);
        return next;
      } catch {
        if (cancelled) return [];
        setDrops([]);
        setDropsLoadedKey(dropsKey);
        return [];
      }
    }

    void load().then((next) => {
      if (cancelled || next.length > 0) {
        setDropsIndexerCatchUp(false);
        return;
      }
      setDropsIndexerCatchUp(true);
      INDEXER_SOFT_RETRY_MS.forEach((delay, index) => {
        timers.push(
          window.setTimeout(() => {
            void load().then((retry) => {
              if (cancelled) return;
              if (retry.length > 0) {
                setDropsIndexerCatchUp(false);
              } else if (index === INDEXER_SOFT_RETRY_MS.length - 1) {
                setDropsIndexerCatchUp(false);
              }
            });
          }, delay)
        );
      });
    });

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [appId, dropsKey]);

  const owner = useMemo(
    () => (app ? isAppOwner(app, viewerAccountId ?? null) : false),
    [app, viewerAccountId]
  );
  const authority = useMemo(
    () => (app ? isAppAuthority(app, viewerAccountId ?? null) : false),
    [app, viewerAccountId]
  );
  const canCreate = useMemo(
    () => (app ? canCreateInApp(app, viewerAccountId ?? null) : false),
    [app, viewerAccountId]
  );
  const isApprovedCreator = useMemo(() => {
    if (!app || !viewerAccountId) return false;
    const id = viewerAccountId.trim().toLowerCase();
    return app.approvedCreators.some((x) => x.toLowerCase() === id);
  }, [app, viewerAccountId]);

  const onManaged = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (notFound || !app) {
    return (
      <OsAppScreen title="Hub" backFallbackHref={APP_APPS_PATH}>
        <div className="market-page">
          <p className="market-page-status">
            This hub isn&rsquo;t available.{' '}
            <Link className="app-soon-link" href={APP_APPS_PATH}>
              Browse hubs
            </Link>
          </p>
        </div>
      </OsAppScreen>
    );
  }

  const createHref = `${APP_DROP_CREATE_PATH}?${MARKET_APP_PARAM}=${encodeURIComponent(app.appId)}`;
  const roster = [
    ...app.moderators.map((id) => ({ id, role: 'Moderator' })),
    ...(app.creatorAccess === 'approval'
      ? app.approvedCreators.map((id) => ({ id, role: 'Creator' }))
      : []),
  ];
  const canRequestPublish =
    isConnected && !canCreate && app.creatorAccess === 'approval';
  const canReviewRequests = authority && app.creatorAccess === 'approval';
  const categoryLabel = hubCategoryLabel(app.category);

  return (
    <OsAppScreen
      title={app.title}
      backFallbackHref={APP_APPS_PATH}
      actions={
        canCreate ? (
          <Link
            href={createHref}
            className={osIconActionClassName}
            aria-label="Create a drop in this hub"
          >
            <PlusIcon aria-hidden />
          </Link>
        ) : undefined
      }
    >
      <div className="app-page">
        {app.bannerUrl ? (
          <div className="app-page-banner">
            <img src={app.bannerUrl} alt="" />
          </div>
        ) : null}

        <header className="app-page-head">
          <span
            className={`app-page-logo${app.mediaUrl ? ' has-media' : ''}`}
            aria-hidden
          >
            {app.mediaUrl ? (
              <img src={app.mediaUrl} alt="" />
            ) : (
              <span className="app-page-monogram">{monogram(app.title)}</span>
            )}
          </span>
          <div className="app-page-headings">
            <h2 className="app-page-title">{app.title}</h2>
            <Link
              href={portfolioPath(app.ownerId)}
              scroll={false}
              className="app-page-owner"
            >
              by @{fallbackLabel(app.ownerId)}
            </Link>
            <div className="app-page-badges">
              {app.topics.length > 0
                ? app.topics.map((topic) => (
                    <span key={topic} className="app-page-badge">
                      {hubCategoryLabel(topic) ?? topic}
                    </span>
                  ))
                : categoryLabel ? (
                    <span className="app-page-badge">{categoryLabel}</span>
                  ) : null}
              <span className="app-page-badge">
                {app.commissionPct}% commission
              </span>
              <span className="app-page-badge">
                {creatorAccessShort(app.creatorAccess)}
              </span>
            </div>
          </div>
        </header>

        {app.description ? (
          <p className="app-page-description">{app.description}</p>
        ) : null}

        {!canCreate && isConnected && !canRequestPublish ? (
          <p className="app-page-note">
            {app.creatorAccess === 'invite_only'
              ? 'Only hub staff can publish here. Ask the owner to add you as a moderator.'
              : `${creatorAccessLabel(app.creatorAccess)}.`}
          </p>
        ) : null}

        <StoreCatalogTabs
          tab={catalogTab}
          onTabChange={setCatalogTab}
          dropCount={dropsLoading ? null : drops.length}
        />

        {catalogTab === 'drops' ? (
          <StoreDropsList
            drops={drops}
            loading={dropsLoading}
            indexerCatchUp={dropsIndexerCatchUp}
            emptyActionHref={createHref}
            canCreate={canCreate}
          />
        ) : (
          <StoreResalePanel appId={app.appId} />
        )}

        <StorePublishRequestSection
          appId={app.appId}
          canRequest={canRequestPublish}
          canReview={canReviewRequests}
          isApprovedCreator={isApprovedCreator}
          onApproved={onManaged}
        />

        {roster.length > 0 ? (
          <section className="app-page-roster" aria-label="Creators">
            <h3 className="market-section-title">Creators</h3>
            <ul className="app-page-roster-list">
              {roster.map((member) => (
                <li key={`${member.role}:${member.id}`}>
                  <Link
                    href={portfolioPath(member.id)}
                    scroll={false}
                    className="app-page-roster-chip"
                  >
                    @{fallbackLabel(member.id)}
                    <span className="app-page-roster-role">{member.role}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {authority && (owner || app.creatorAccess === 'approval') ? (
          <AppManageSection
            app={app}
            onChanged={onManaged}
            canManageSettings={owner}
            canManageCreators={authority}
          />
        ) : null}
      </div>
    </OsAppScreen>
  );
}
