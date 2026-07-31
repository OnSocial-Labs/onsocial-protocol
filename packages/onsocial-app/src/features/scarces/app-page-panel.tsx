'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  InformationCircleFillIcon,
  PlusIcon,
  SettingsIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  appVolumeNearLabel,
  canCreateInApp,
  creatorAccessLabel,
  creatorAccessShort,
  fetchApp,
  fetchAppIndexerRow,
  fetchAppStats,
  isAppAuthority,
  isAppOwner,
  type AppStatsView,
  type AppView,
} from '@/features/scarces/apps-data';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { guildCoverStyle } from '@/features/guilds/guild-visual';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import {
  HubCreatorsSheet,
  HubFactsSheet,
} from '@/features/scarces/hub-info-sheets';
import {
  HubAccessSheet,
  HubLookSheet,
  HubPeopleSheet,
  HubTransferSheet,
  type HubManageSheetId,
} from '@/features/scarces/hub-manage-sheets';
import { HubSettingsSheet } from '@/features/scarces/hub-settings-sheet';
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
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  APP_APPS_PATH,
  APP_DROP_CREATE_PATH,
  MARKET_APP_PARAM,
} from '@/lib/app-routes';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

const PUBLISH_SECTION_ID = 'hub-publish-requests';

/** Two-letter monogram from the store name for the logo fallback. */
function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function keepPctLabel(primarySaleBps: number): string {
  const pct = (10000 - primarySaleBps) / 100;
  return Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(2).replace(/\.?0+$/, '');
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
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<AppStatsView | null>(null);
  const [catalogTab, setCatalogTab] = useState<StoreCatalogTab>('drops');
  const [drops, setDrops] = useState<CollectionView[]>([]);
  const [dropsLoadedKey, setDropsLoadedKey] = useState<string | null>(null);
  const [dropsIndexerCatchUp, setDropsIndexerCatchUp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  const [manageSheet, setManageSheet] = useState<HubManageSheetId | null>(
    null
  );
  const settingsNextRef = useRef<HubManageSheetId | null>(null);
  const dropsKey = `${appId}:${refreshKey}`;
  const dropsLoading = dropsLoadedKey !== dropsKey;

  // Indexer paints the hero first when the server had nothing cached.
  useEffect(() => {
    if (initial || app) return;
    let cancelled = false;
    void fetchAppIndexerRow(appId).then((row) => {
      if (cancelled || !row) return;
      setApp((prev) => prev ?? row);
    });
    return () => {
      cancelled = true;
    };
  }, [appId, initial, app]);

  // Contract record reconciles roster / commission / access (ACL truth).
  useEffect(() => {
    let cancelled = false;
    void fetchApp(appId).then((next) => {
      if (cancelled) return;
      if (next) {
        setApp(next);
        setNotFound(false);
      } else {
        setApp((prev) => {
          if (!prev) setNotFound(true);
          return prev;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appId, refreshKey]);

  // Rolled-up hub stats — indexer only.
  useEffect(() => {
    let cancelled = false;
    void fetchAppStats(appId).then((next) => {
      if (!cancelled) setStats(next);
    });
    return () => {
      cancelled = true;
    };
  }, [appId, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

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

  const rosterIds = useMemo(() => {
    if (!app) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of [
      app.ownerId,
      ...app.moderators,
      ...(app.creatorAccess === 'approval' ? app.approvedCreators : []),
    ]) {
      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      ids.push(trimmed);
    }
    return ids;
  }, [app]);
  const rosterProfiles = usePostAuthorProfiles(rosterIds.slice(0, 4));

  const onManaged = useCallback(() => setRefreshKey((k) => k + 1), []);

  const scrollToPublish = useCallback(() => {
    document
      .getElementById(PUBLISH_SECTION_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const showSettingsGear =
    authority && (owner || app?.creatorAccess === 'approval');

  if (notFound && !app) {
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

  if (!app) {
    return (
      <OsAppScreen title="Hub" backFallbackHref={APP_APPS_PATH}>
        <div className="app-page" aria-busy="true">
          <div className="app-hub-cover guild-hero-cover--fallback" />
          <p className="sr-only">Loading hub…</p>
        </div>
      </OsAppScreen>
    );
  }

  const createHref = `${APP_DROP_CREATE_PATH}?${MARKET_APP_PARAM}=${encodeURIComponent(app.appId)}`;
  const canRequestPublish =
    isConnected && !canCreate && app.creatorAccess === 'approval';
  const canReviewRequests = authority && app.creatorAccess === 'approval';
  const keepPct = keepPctLabel(app.primarySaleBps);
  const creatorCount = rosterIds.length;

  return (
    <OsAppScreen
      title={app.title}
      backFallbackHref={APP_APPS_PATH}
      actions={
        canCreate || showSettingsGear ? (
          <>
            {canCreate ? (
              <Link
                href={createHref}
                className={osIconActionClassName}
                aria-label="Create a drop in this hub"
              >
                <PlusIcon aria-hidden />
              </Link>
            ) : null}
            {showSettingsGear ? (
              <button
                type="button"
                className={osIconActionClassName}
                aria-label="Hub settings"
                onClick={() => {
                  if (owner) {
                    setSettingsOpen(true);
                    return;
                  }
                  setManageSheet('people');
                }}
              >
                <SettingsIcon
                  className="glass-sheet-close-icon"
                  aria-hidden
                />
              </button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div className="app-page">
        <section className="app-page-hero" aria-label="Hub profile">
          <div
            className={`app-hub-cover${
              app.bannerUrl ? '' : ' guild-hero-cover--fallback'
            }`}
            style={guildCoverStyle(app.bannerUrl, app.appId)}
            aria-hidden
          >
            {app.bannerUrl ? <img src={app.bannerUrl} alt="" /> : null}
          </div>

          <header className="app-page-head app-page-head--overlap">
            <span
              className={`app-page-logo${app.mediaUrl ? ' has-media' : ''}`}
              aria-hidden
            >
              {app.mediaUrl ? (
                <img src={app.mediaUrl} alt="" />
              ) : (
                <span className="app-page-monogram">
                  {monogram(app.title)}
                </span>
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
            </div>
          </header>

          <div className="app-hub-meta-row">
            <GuildFacepile
              memberIds={rosterIds}
              profiles={rosterProfiles}
              showCount={false}
              onClick={() => setCreatorsOpen(true)}
              aria-label={`${creatorCount} ${
                creatorCount === 1 ? 'creator' : 'creators'
              }. View roster.`}
            />
            <button
              type="button"
              className="guild-hero-meta-link"
              onClick={() => setCreatorsOpen(true)}
            >
              {creatorCount} {creatorCount === 1 ? 'creator' : 'creators'}
            </button>
            <span className="app-hub-meta-dot" aria-hidden>
              ·
            </span>
            <span className="app-hub-meta-access">
              {creatorAccessShort(app.creatorAccess)}
            </span>
            <button
              type="button"
              className="guild-hero-facts-button"
              aria-label="Hub facts"
              onClick={() => setFactsOpen(true)}
            >
              <InformationCircleFillIcon
                className="guild-hero-facts-icon"
                aria-hidden
              />
            </button>
          </div>

          <div className="app-page-badges">
            {app.categories.map((category) => (
              <span key={category} className="app-page-badge">
                {hubCategoryLabel(category) ?? category}
              </span>
            ))}
            <span className="app-page-badge app-hub-keep">
              Creators keep {keepPct}%
            </span>
          </div>

          {stats ? (
            <dl className="app-hub-stats" aria-label="Hub activity">
              <div className="app-hub-stat">
                <dt>Drops</dt>
                <dd>{stats.dropsTotal}</dd>
              </div>
              <div className="app-hub-stat">
                <dt>Minted</dt>
                <dd>{stats.mintedTotal}</dd>
              </div>
              <div className="app-hub-stat">
                <dt>Holders</dt>
                <dd>{stats.uniqueHolders}</dd>
              </div>
              <div className="app-hub-stat">
                <dt>Volume</dt>
                <dd>
                  {appVolumeNearLabel(stats.salesVolumeYocto)}
                  <span className="app-hub-stat-unit"> NEAR</span>
                </dd>
              </div>
            </dl>
          ) : null}

          {app.description ? (
            <p className="app-page-description">{app.description}</p>
          ) : null}

          {canCreate ? (
            <div className="app-hub-cta-row">
              <Link className="app-hub-cta" href={createHref}>
                Start a drop
              </Link>
            </div>
          ) : canRequestPublish ? (
            <div className="app-hub-cta-row">
              <button
                type="button"
                className="app-hub-cta"
                onClick={scrollToPublish}
              >
                Request to publish
              </button>
            </div>
          ) : null}
        </section>

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
            spotlight
          />
        ) : (
          <StoreResalePanel appId={app.appId} />
        )}

        <div id={PUBLISH_SECTION_ID}>
          <StorePublishRequestSection
            appId={app.appId}
            canRequest={canRequestPublish}
            canReview={canReviewRequests}
            isApprovedCreator={isApprovedCreator}
            onApproved={onManaged}
          />
        </div>
      </div>

      <HubFactsSheet
        open={factsOpen}
        onClose={() => setFactsOpen(false)}
        app={app}
        stats={stats}
        onOpenCreators={() => setCreatorsOpen(true)}
      />

      <HubCreatorsSheet
        open={creatorsOpen}
        onClose={() => setCreatorsOpen(false)}
        app={app}
      />

      {owner ? (
        <HubSettingsSheet
          open={settingsOpen}
          hubName={app.title}
          showPeople
          onClose={() => {
            setSettingsOpen(false);
            const next = settingsNextRef.current;
            settingsNextRef.current = null;
            if (next) setManageSheet(next);
          }}
          onOpenSheet={(sheet) => {
            settingsNextRef.current = sheet;
          }}
        />
      ) : null}

      {owner ? (
        <HubLookSheet
          open={manageSheet === 'look'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
        />
      ) : null}

      {owner ? (
        <HubAccessSheet
          open={manageSheet === 'access'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
        />
      ) : null}

      {authority && (owner || app.creatorAccess === 'approval') ? (
        <HubPeopleSheet
          open={manageSheet === 'people'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
          canManageCreators={authority}
          canManageModerators={owner}
        />
      ) : null}

      {owner ? (
        <HubTransferSheet
          open={manageSheet === 'transfer'}
          app={app}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
        />
      ) : null}
    </OsAppScreen>
  );
}
