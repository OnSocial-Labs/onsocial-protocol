'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HashtagCount, PlaceCount, TickerCount } from '@onsocial/sdk';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import {
  DiscoverTrendingChipSectionSkeleton,
  DiscoverTrendingGuildsSectionSkeleton,
  DiscoverTrendingProfilesSectionSkeleton,
} from '@/features/discover/discover-loading-skeleton';
import { DiscoverFaceFilterRail } from '@/features/discover/discover-face-filter-rail';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import { discoverTrendingLead } from '@/lib/discover-tab-lead';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import { homePlacePath, placeLabel } from '@/lib/post-place';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { getGlobalViewerEndorsementLedger } from '@/lib/viewer-endorsement-global';
import { overlayViewerEndorsedOnAccounts } from '@/lib/viewer-endorsement-ledger';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import {
  APP_GROUPS_PATH,
  appPath,
  daoPath,
} from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  discoverProfileToProfileListAccount,
  fetchDiscoverProfiles,
} from '@/lib/discover-profiles';
import {
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';
import type {
  DiscoverTrendingDao,
  DiscoverTrendingGuild,
  DiscoverTrendingHub,
  DiscoverTrendingSeed,
} from '@/lib/discover-trending-server';
import {
  discoverTrendingFilterQuery,
  filterTrendingDaos,
  filterTrendingGuilds,
  filterTrendingHubs,
  filterTrendingPlaces,
  filterTrendingProfiles,
  filterTrendingTickers,
  filterTrendingTopics,
} from '@/lib/discover-trending-filter';
import { fetchDaoCatalog } from '@/features/protocol/dao-catalog-client';
import { resolveDaoDirectoryName } from '@/features/protocol/dao-directory';
import { fetchAppsDirectory } from '@/features/scarces/apps-data';
import {
  rankGuildPeeks,
  rankHubPeeks,
} from '@/features/discover/discover-community-ranking';

const SECTION_LIMIT = 6;
const COMMUNITY_RANK_POOL = 32;

/**
 * Default Discover landing: mixed trending sections. Profiles use the same
 * social list rows as the Profiles tab (avatar, standing count, Stand).
 * Community peeks: DAOs → Guilds → Hubs. Scarce rankings live on Hubs tab.
 * Sections paint independently as each query settles.
 */
export function DiscoverTrendingPanel({
  onOpenTab,
  initial = null,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
  initial?: DiscoverTrendingSeed | null;
}) {
  const { query, face, industry } = useDiscoverPanel();
  const {
    accountId: viewerAccountId,
    isConnected,
    connect,
  } = useAppWallet();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('discover');
  const { endorsementSyncVersion } = useViewerEndorsement('discover');

  const [tickers, setTickers] = useState<TickerCount[] | null>(
    () => initial?.tickers ?? null
  );
  const [topics, setTopics] = useState<HashtagCount[] | null>(
    () => initial?.topics ?? null
  );
  const [places, setPlaces] = useState<PlaceCount[] | null>(
    () => initial?.places ?? null
  );
  const [profiles, setProfiles] = useState<ProfileListAccount[] | null>(
    () => initial?.profiles ?? null
  );
  const [guilds, setGuilds] = useState<DiscoverTrendingGuild[] | null>(
    () => initial?.guilds ?? null
  );
  const [daos, setDaos] = useState<DiscoverTrendingDao[] | null>(
    () => initial?.daos ?? null
  );
  const [hubs, setHubs] = useState<DiscoverTrendingHub[] | null>(
    () => initial?.hubs ?? null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const viewerKey = viewerAccountId ?? null;
  // Soft-refresh whenever we already have painted rows (SSR or prior fetch).
  const hasPaintedRef = useRef(
    initial != null &&
      (initial.tickers.length > 0 ||
        initial.topics.length > 0 ||
        (initial.places?.length ?? 0) > 0 ||
        initial.profiles.length > 0 ||
        initial.guilds.length > 0 ||
        initial.daos.length > 0 ||
        initial.hubs.length > 0)
  );

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    const soft = hasPaintedRef.current;

    // Never blank a painted trending shell on wallet reconcile.
    if (!soft) {
      setTickers(null);
      setTopics(null);
      setPlaces(null);
      setProfiles(null);
      setGuilds(null);
      setDaos(null);
      setHubs(null);
    }

    void client.query.tickers
      .trending({ limit: SECTION_LIMIT })
      .then((rows) => {
        if (cancelled) return;
        setTickers(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setTickers([]);
      });

    void client.query.hashtags
      .trending({ limit: SECTION_LIMIT })
      .then((rows) => {
        if (cancelled) return;
        setTopics(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setTopics([]);
      });

    void client.query.places
      .trending({ limit: SECTION_LIMIT })
      .then((rows) => {
        if (cancelled) return;
        setPlaces(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setPlaces([]);
      });

    void rankGuildPeeks(client, {
      browseLimit: COMMUNITY_RANK_POOL,
      peekLimit: SECTION_LIMIT,
    })
      .then((rows) => {
        if (cancelled) return;
        setGuilds(
          rows.map((g) => ({
            groupId: g.groupId,
            groupName: g.groupName,
          }))
        );
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setGuilds([]);
      });

    void fetchDaoCatalog({ limit: SECTION_LIMIT, offset: 0 })
      .then((page) => {
        if (cancelled) return;
        setDaos(
          page.daos.map((row) => ({
            daoAccountId: row.daoAccountId,
            name: row.name,
          }))
        );
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setDaos([]);
      });

    void rankHubPeeks(client, {
      peekLimit: SECTION_LIMIT,
      fetchRecentFallback: async () => {
        const page = await fetchAppsDirectory({
          limit: COMMUNITY_RANK_POOL,
          hideTest: true,
          sort: 'recent',
        });
        return page.apps.map((app) => ({
          appId: app.appId,
          title: app.title?.trim() || null,
        }));
      },
    })
      .then((rows) => {
        if (cancelled) return;
        setHubs(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setHubs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [viewerKey]);

  useEffect(() => {
    let cancelled = false;
    const soft = hasPaintedRef.current;
    void fetchDiscoverProfiles('', viewerKey, 0, undefined, {
      face,
      industry,
    })
      .then((page) => {
        if (cancelled) return;
        setProfiles(
          (page?.profiles ?? [])
            .slice(0, SECTION_LIMIT)
            .map(discoverProfileToProfileListAccount)
        );
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [face, industry, viewerKey]);

  const isStandingPending = useCallback(
    (targetAccountId: string) =>
      pendingStandingIds.has(targetAccountId) ||
      isStandingPendingForTarget(targetAccountId),
    [isStandingPendingForTarget, pendingStandingIds]
  );

  const handleUpdateStanding = useCallback(
    async (account: ProfileListAccount, shouldStand: boolean) => {
      if (isStandingPending(account.accountId)) return;

      setActionError(null);
      setPendingStandingIds((prev) => new Set(prev).add(account.accountId));

      try {
        await updateStanding(
          profileListAccountToStandingSummary(account),
          shouldStand
        );
        setProfiles((current) =>
          (current ?? []).map((profile) =>
            profile.accountId === account.accountId
              ? {
                  ...profile,
                  viewerStanding: shouldStand,
                  standingSince: shouldStand
                    ? (profile.standingSince ?? Date.now())
                    : null,
                  standingBlockTimestamp: shouldStand
                    ? (profile.standingBlockTimestamp ?? Date.now())
                    : null,
                  standingCount: Math.max(
                    0,
                    profile.standingCount +
                      (shouldStand === profile.viewerStanding
                        ? 0
                        : shouldStand
                          ? 1
                          : -1)
                  ),
                }
              : profile
          )
        );
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : 'Could not update standing.'
        );
      } finally {
        setPendingStandingIds((prev) => {
          const next = new Set(prev);
          next.delete(account.accountId);
          return next;
        });
      }
    },
    [isStandingPending, updateStanding]
  );

  const filterNeedle = discoverTrendingFilterQuery(query);
  const visibleTickers = useMemo(
    () => (tickers == null ? null : filterTrendingTickers(tickers, query)),
    [query, tickers]
  );
  const visibleTopics = useMemo(
    () => (topics == null ? null : filterTrendingTopics(topics, query)),
    [query, topics]
  );
  const visiblePlaces = useMemo(
    () => (places == null ? null : filterTrendingPlaces(places, query)),
    [places, query]
  );
  const visibleProfiles = useMemo(
    () =>
      profiles == null
        ? null
        : overlayViewerEndorsedOnAccounts(
            filterTrendingProfiles(profiles, query),
            getGlobalViewerEndorsementLedger()
          ),
    [endorsementSyncVersion, profiles, query]
  );
  const visibleDaos = useMemo(
    () => (daos == null ? null : filterTrendingDaos(daos, query)),
    [daos, query]
  );
  const visibleGuilds = useMemo(
    () => (guilds == null ? null : filterTrendingGuilds(guilds, query)),
    [guilds, query]
  );
  const visibleHubs = useMemo(
    () => (hubs == null ? null : filterTrendingHubs(hubs, query)),
    [hubs, query]
  );

  const allSettled =
    visibleTickers !== null &&
    visibleTopics !== null &&
    visiblePlaces !== null &&
    visibleProfiles !== null &&
    visibleGuilds !== null &&
    visibleDaos !== null &&
    visibleHubs !== null;
  const empty =
    allSettled &&
    visibleTickers.length === 0 &&
    visibleTopics.length === 0 &&
    visiblePlaces.length === 0 &&
    visibleProfiles.length === 0 &&
    visibleGuilds.length === 0 &&
    visibleDaos.length === 0 &&
    visibleHubs.length === 0;
  const anyLoading =
    visibleTickers === null ||
    visibleTopics === null ||
    visiblePlaces === null ||
    visibleProfiles === null ||
    visibleGuilds === null ||
    visibleDaos === null ||
    visibleHubs === null;

  return (
    <div
      id="discover-panel-trending"
      className="discover-trending-panel"
      role="tabpanel"
      aria-labelledby="discover-tab-trending"
      aria-busy={anyLoading || undefined}
    >
      <DiscoverTabLead>{discoverTrendingLead()}</DiscoverTabLead>
      <DiscoverFaceFilterRail />

      {anyLoading ? (
        <p className="sr-only">Loading trending…</p>
      ) : null}

      {empty ? (
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">
            {filterNeedle ? 'No matches.' : 'Nothing trending yet.'}
          </p>
          {filterNeedle ? null : (
            <p className="standing-panel-empty-secondary">
              Open Profiles, DAOs, Guilds, Hubs, Topics, or Tickers to browse
              the graph.
            </p>
          )}
        </div>
      ) : null}

      {visibleTickers === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : visibleTickers.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Trending tickers</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('tickers')}
            >
              See all
            </button>
          </div>
          <div className="discover-trending-chips">
            {visibleTickers.slice(0, 6).map((item) => (
              <Link
                key={`k-${item.ticker}`}
                href={homeTickerPath(item.ticker)}
                className="discover-trending-chip discover-trending-chip--ticker"
              >
                {formatTickerDisplay(item.ticker)}
                <span className="discover-trending-chip-count">
                  {item.postCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {visibleTopics === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : visibleTopics.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Trending topics</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('topics')}
            >
              See all
            </button>
          </div>
          <div className="discover-trending-chips">
            {visibleTopics.slice(0, 6).map((item) => (
              <Link
                key={`h-${item.hashtag}`}
                href={homeHashtagPath(item.hashtag)}
                className="discover-trending-chip"
              >
                #{item.hashtag}
                <span className="discover-trending-chip-count">
                  {item.postCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {visiblePlaces === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : visiblePlaces.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Trending places</h2>
          </div>
          <div className="discover-trending-chips">
            {visiblePlaces.slice(0, 6).map((item) => (
              <Link
                key={`p-${item.place}`}
                href={homePlacePath(item.place)}
                className="discover-trending-chip"
              >
                {placeLabel(item.place) ?? item.place}
                <span className="discover-trending-chip-count">
                  {item.postCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {visibleProfiles === null ? (
        <DiscoverTrendingProfilesSectionSkeleton />
      ) : visibleProfiles.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Standing out</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('profiles')}
            >
              See all
            </button>
          </div>

          {!isConnected ? (
            <p className="discover-connect-hint">
              <button
                type="button"
                className="discover-connect-hint-action"
                onClick={() => void connect()}
              >
                Connect wallet
              </button>{' '}
              to stand with profiles.
            </p>
          ) : null}

          {actionError ? (
            <p className="standing-panel-error" role="alert">
              {actionError}
            </p>
          ) : null}

          <ProfileSocialList
            accounts={visibleProfiles}
            listKey="trending-profiles"
            viewerAccountId={viewerKey}
            showSolidarityBadge
            standingTimeMode="viewer-only"
            skeletonRowVariant="discover"
            viewerRelationshipsLoading={false}
            canUpdateStandingFor={(account) =>
              isConnected &&
              Boolean(viewerKey) &&
              viewerKey !== account.accountId
            }
            isPendingFor={isStandingPending}
            onUpdateStanding={(account, shouldStand) => {
              if (!viewerKey || viewerKey === account.accountId) return;
              void handleUpdateStanding(account, shouldStand);
            }}
            loadMoreSentinelRef={loadMoreRef}
            footerSummary={null}
            isLoadingMore={false}
            showLoadMoreSentinel={false}
          />
        </section>
      ) : null}

      {visibleDaos === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : visibleDaos.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">DAOs</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('daos')}
            >
              See all
            </button>
          </div>
          <ul className="discover-focus-rows">
            {visibleDaos.map((dao) => {
              const label = resolveDaoDirectoryName(dao.daoAccountId, {
                name: dao.name,
              });
              return (
                <li key={dao.daoAccountId}>
                  <Link
                    href={daoPath(dao.daoAccountId)}
                    className="discover-focus-row"
                  >
                    <span className="discover-focus-row-label">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {visibleGuilds === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : visibleGuilds.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Guilds</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('guilds')}
            >
              See all
            </button>
          </div>
          <ul className="discover-focus-rows">
            {visibleGuilds.map((guild) => (
              <li key={guild.groupId}>
                <Link
                  href={`${APP_GROUPS_PATH}/${encodeURIComponent(guild.groupId)}`}
                  className="discover-focus-row"
                >
                  <span className="discover-focus-row-label">
                    {guild.groupName?.trim() || guild.groupId}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visibleHubs === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : visibleHubs.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Hubs</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('hubs')}
            >
              See all
            </button>
          </div>
          <ul className="discover-focus-rows">
            {visibleHubs.map((hub) => (
              <li key={hub.appId}>
                <Link href={appPath(hub.appId)} className="discover-focus-row">
                  <span className="discover-focus-row-label">
                    {hub.title?.trim() || hub.appId}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
