'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  InformationCircleFillIcon,
  SettingsIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
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
import { GuildDescriptionClamp } from '@/features/guilds/guild-description-clamp';
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
import { HubPublishRequestsSheet } from '@/features/scarces/hub-publish-requests-sheet';
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
import {
  fetchStorePublishDecisions,
  fetchStorePublishRequests,
  filterActionablePublishRequests,
} from '@/features/scarces/store-publish-requests';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  APP_APPS_PATH,
  APP_DROP_CREATE_PATH,
  MARKET_APP_PARAM,
} from '@/lib/app-routes';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import { formatProfileCount } from '@/lib/profile-social-standings';

const PUBLISH_SECTION_ID = 'hub-publish-requests';

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
  const router = useRouter();
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
  const [pendingPublishSnapshot, setPendingPublishSnapshot] = useState<{
    appId: string;
    count: number;
  } | null>(null);
  const [manageSheet, setManageSheet] = useState<HubManageSheetId | null>(
    null
  );
  const settingsNextRef = useRef<HubManageSheetId | null>(null);
  const creatorsNextRef = useRef(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const dropsKey = `${appId}:${refreshKey}`;
  const dropsLoading = dropsLoadedKey !== dropsKey;
  const hasApp = app != null;
  // Auto-hide only while the tab rail is stuck under the elevated chrome —
  // stay visible at the top of the page (same path as the bottom dock).
  const catalogTabsHidden = useDockAutoHide(!headerElevated);

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

  // Title handoff: elevate the immersive nav once the hero name scrolls
  // under it — same recipe as the guild page, minus the room-filter rail.
  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || !hasApp) return;

    const heroTitle = heroTitleRef.current;
    const header = scrollRoot.parentElement?.querySelector(
      '.os-app-screen-header'
    );
    const screen = scrollRoot.closest<HTMLElement>('.os-app-screen') ?? null;
    const railPin = scrollRoot.querySelector('.guild-feed-filter-pin');

    const syncElevated = () => {
      const scrolled = scrollRoot.scrollTop > 8;
      if (!heroTitle) {
        setHeaderElevated(scrollRoot.scrollTop > 18);
        return;
      }
      const headerBottom =
        header?.getBoundingClientRect().bottom ??
        scrollRoot.getBoundingClientRect().top + 72;
      const heroRect = heroTitle.getBoundingClientRect();
      const titleTop = heroRect.top;

      // Guard: before first layout (height 0), leave handoff at 0 so the
      // hero name stays visible on first paint.
      if (heroRect.height > 0) {
        const fadeZone = 28;
        const distance = titleTop - headerBottom;
        const t = Math.max(0, Math.min(1, 1 - distance / fadeZone));
        screen?.style.setProperty('--title-handoff', String(t));
      }

      // Rail reveal: the chrome glass starts at nav height and grows down to
      // meet the catalog tabs over their final approach, docking flush.
      if (railPin) {
        const pinRect = railPin.getBoundingClientRect();
        if (pinRect.height > 0) {
          const approach = pinRect.height;
          const p = Math.max(
            0,
            Math.min(1, (headerBottom + approach - pinRect.top) / approach)
          );
          screen?.style.setProperty('--os-rail-reveal', String(p));
        }
      }

      setHeaderElevated((current) => {
        if (current) {
          return scrolled && titleTop < headerBottom + 2;
        }
        return scrolled && titleTop < headerBottom - 4;
      });
    };

    syncElevated();
    scrollRoot.addEventListener('scroll', syncElevated, { passive: true });
    window.addEventListener('resize', syncElevated, { passive: true });
    return () => {
      scrollRoot.removeEventListener('scroll', syncElevated);
      window.removeEventListener('resize', syncElevated);
      screen?.style.removeProperty('--title-handoff');
      screen?.style.removeProperty('--os-rail-reveal');
    };
  }, [hasApp]);

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

  const canReviewRequests =
    Boolean(authority && app?.creatorAccess === 'approval');
  const reviewAppId =
    canReviewRequests && app ? app.appId : null;
  const approvedCreatorsKey = useMemo(
    () =>
      (app?.approvedCreators ?? [])
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|'),
    [app?.approvedCreators]
  );
  const pendingPublishCount =
    reviewAppId && pendingPublishSnapshot?.appId === reviewAppId
      ? pendingPublishSnapshot.count
      : 0;

  // Soft mailbox count for the settings gear / Publish requests row.
  useEffect(() => {
    if (!reviewAppId) return;
    let cancelled = false;
    const approved = approvedCreatorsKey
      ? approvedCreatorsKey.split('|')
      : [];
    void Promise.all([
      fetchStorePublishRequests(reviewAppId),
      fetchStorePublishDecisions(reviewAppId),
    ]).then(([rows, decisions]) => {
      if (cancelled) return;
      setPendingPublishSnapshot({
        appId: reviewAppId,
        count: filterActionablePublishRequests(rows, approved, decisions)
          .length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reviewAppId, approvedCreatorsKey, refreshKey]);

  // Drop creation lives on the dock — purple stars where the pen sits for
  // posts. The button only shows while a creator is on this hub.
  const createHref = `${APP_DROP_CREATE_PATH}?${MARKET_APP_PARAM}=${encodeURIComponent(appId)}`;
  const openDropCreate = useCallback(() => {
    router.push(createHref);
  }, [createHref, router]);
  useRegisterComposeAction(canCreate ? openDropCreate : null, 'drop');

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
      <OsAppScreen title="Hub" backFallbackHref={APP_APPS_PATH} immersiveHeader>
        <div className="app-page" aria-busy="true">
          <div className="app-hub-cover guild-hero-cover--fallback" />
          <p className="sr-only">Loading hub…</p>
        </div>
      </OsAppScreen>
    );
  }

  const canRequestPublish =
    isConnected && !canCreate && app.creatorAccess === 'approval';
  const creatorCount = rosterIds.length;
  const hasActivity =
    stats != null &&
    (stats.dropsTotal > 0 ||
      stats.mintedTotal > 0 ||
      stats.salesCount > 0 ||
      stats.liveListings > 0);

  return (
    <OsAppScreen
      title={app.title}
      backFallbackHref={APP_APPS_PATH}
      actions={
        showSettingsGear ? (
          <button
            type="button"
            className={`${osIconActionClassName} guild-manage-menu-trigger${
              canReviewRequests && pendingPublishCount > 0 ? ' has-badge' : ''
            }`}
            aria-label={
              canReviewRequests && pendingPublishCount > 0
                ? `Hub settings, ${pendingPublishCount} publish requests`
                : 'Hub settings'
            }
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon
              className="glass-sheet-close-icon guild-manage-menu-icon"
              aria-hidden
            />
            {canReviewRequests && pendingPublishCount > 0 ? (
              <span className="guild-manage-menu-badge" aria-hidden>
                {formatProfileCount(pendingPublishCount)}
              </span>
            ) : null}
          </button>
        ) : undefined
      }
      immersiveHeader
      headerElevated={headerElevated}
      scrollRootRef={scrollRootRef}
    >
      {/* Viewport-anchored chrome glass — nav + catalog rail frost as one pane. */}
      <div
        aria-hidden
        className={`os-chrome-glass${headerElevated ? ' is-frosted' : ''}${
          headerElevated && catalogTabsHidden ? ' is-rail-hidden' : ''
        }`}
      />
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
              <h2 className="app-page-title" ref={heroTitleRef}>
                {app.title}
              </h2>
              <Link
                href={portfolioPath(app.ownerId)}
                scroll={false}
                className="app-page-owner"
              >
                by @{fallbackLabel(app.ownerId)}
              </Link>
            </div>
          </header>

          {/* Same anatomy as guild-hero-meta: facepile + count, then
              mode + facts tucked tight — categories on their own tags row. */}
          <div className="guild-hero-meta">
            <div className="guild-hero-meta-main">
              <GuildFacepile
                memberIds={rosterIds}
                profiles={rosterProfiles}
                memberCount={creatorCount}
                countUnit={{ one: 'creator', other: 'creators' }}
                onClick={() => setCreatorsOpen(true)}
              />
              <span className="guild-hero-mode-row">
                <span className="guild-hero-mode">
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
              </span>
            </div>
          </div>

          {app.categories.length > 0 ? (
            <div className="guild-hero-tags" aria-label="Hub categories">
              {app.categories.map((category) => (
                <span key={category}>
                  {hubCategoryLabel(category) ?? category}
                </span>
              ))}
            </div>
          ) : null}

          {stats && hasActivity ? (
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
            <GuildDescriptionClamp text={app.description} />
          ) : null}

          {canRequestPublish ? (
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
          pinned
          scrollHidden={headerElevated && catalogTabsHidden}
        />

        {catalogTab === 'drops' ? (
          <StoreDropsList
            drops={drops}
            loading={dropsLoading}
            indexerCatchUp={dropsIndexerCatchUp}
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
            isApprovedCreator={isApprovedCreator}
          />
        </div>
      </div>

      <HubFactsSheet
        open={factsOpen}
        onClose={() => {
          setFactsOpen(false);
          if (creatorsNextRef.current) {
            creatorsNextRef.current = false;
            setCreatorsOpen(true);
          }
        }}
        app={app}
        stats={stats}
        onOpenCreators={() => {
          creatorsNextRef.current = true;
        }}
      />

      <HubCreatorsSheet
        open={creatorsOpen}
        onClose={() => setCreatorsOpen(false)}
        app={app}
      />

      {showSettingsGear ? (
        <HubSettingsSheet
          open={settingsOpen}
          hubName={app.title}
          showOwnerTools={owner}
          showPeople={authority && (owner || app.creatorAccess === 'approval')}
          showPublishRequests={canReviewRequests}
          publishRequestCount={pendingPublishCount}
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

      {canReviewRequests ? (
        <HubPublishRequestsSheet
          open={manageSheet === 'publish-requests'}
          appId={app.appId}
          approvedCreatorIds={app.approvedCreators}
          onClose={() => setManageSheet(null)}
          onChanged={onManaged}
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
