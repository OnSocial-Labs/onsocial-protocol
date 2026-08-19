'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import {
  DiscoverTrendingChipSectionSkeleton,
  DiscoverTrendingGuildsSectionSkeleton,
  DiscoverTrendingProfilesSectionSkeleton,
} from '@/features/discover/discover-loading-skeleton';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import {
  APP_GROUPS_PATH,
  collectionPath,
  daoPath,
  dropsPath,
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
  DiscoverTrendingScarce,
  DiscoverTrendingSeed,
} from '@/lib/discover-trending-server';
import { fetchDaoCatalog } from '@/features/protocol/dao-catalog-client';
import { resolveDaoDirectoryName } from '@/features/protocol/dao-directory';

const SECTION_LIMIT = 6;
const SCARCE_PEEK_LIMIT = 6;

async function fetchMostTradedPeeks(
  client: ReturnType<typeof createReadOnlyOnSocialClient>
): Promise<DiscoverTrendingScarce[]> {
  try {
    const ranks = await client.query.scarces.collectionTradeStats({
      limit: SCARCE_PEEK_LIMIT,
      offset: 0,
    });
    const ids = ranks.map((row) => row.collectionId.trim()).filter(Boolean);
    if (ids.length === 0) return [];
    const shells = await client.query.scarces.collectionsCurrentByIds(ids);
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    const appById = new Map(
      ranks.map((row) => [row.collectionId.trim(), row.appId] as const)
    );
    const out: DiscoverTrendingScarce[] = [];
    for (const id of ids) {
      const shell = byId.get(id);
      if (!shell) continue;
      out.push({
        collectionId: shell.collectionId,
        title: shell.title?.trim() || null,
        appId: shell.appId?.trim() || appById.get(id) || null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchMostLovedPeeks(
  client: ReturnType<typeof createReadOnlyOnSocialClient>
): Promise<DiscoverTrendingScarce[]> {
  try {
    let ranks: Array<{ collectionId: string }> = [];
    try {
      ranks = await client.query.scarces.collectionLoveFans({
        limit: SCARCE_PEEK_LIMIT,
        offset: 0,
      });
    } catch {
      ranks = await client.query.scarces.albumLoveFans({
        limit: SCARCE_PEEK_LIMIT,
        offset: 0,
      });
    }
    const ids = ranks.map((row) => row.collectionId.trim()).filter(Boolean);
    if (ids.length === 0) return [];
    const shells = await client.query.scarces.collectionsCurrentByIds(ids);
    const byId = new Map(
      shells.map((row) => [row.collectionId.trim(), row] as const)
    );
    const out: DiscoverTrendingScarce[] = [];
    for (const id of ids) {
      const shell = byId.get(id);
      if (!shell) continue;
      out.push({
        collectionId: shell.collectionId,
        title: shell.title?.trim() || null,
        appId: shell.appId?.trim() || null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Default Discover landing: mixed trending sections. Profiles use the same
 * social list rows as the Profiles tab (avatar, standing count, Stand).
 * Sections paint independently as each query settles.
 */
export function DiscoverTrendingPanel({
  onOpenTab,
  initial = null,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
  initial?: DiscoverTrendingSeed | null;
}) {
  const {
    accountId: viewerAccountId,
    isConnected,
    connect,
  } = useAppWallet();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('discover');

  const [tickers, setTickers] = useState<TickerCount[] | null>(
    () => initial?.tickers ?? null
  );
  const [topics, setTopics] = useState<HashtagCount[] | null>(
    () => initial?.topics ?? null
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
  const [mostTraded, setMostTraded] = useState<DiscoverTrendingScarce[] | null>(
    () => initial?.mostTraded ?? null
  );
  const [mostLoved, setMostLoved] = useState<DiscoverTrendingScarce[] | null>(
    () => initial?.mostLoved ?? null
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
        initial.profiles.length > 0 ||
        initial.guilds.length > 0 ||
        initial.daos.length > 0 ||
        initial.mostTraded.length > 0 ||
        initial.mostLoved.length > 0)
  );

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    const soft = hasPaintedRef.current;

    // Never blank a painted trending shell on wallet reconcile.
    if (!soft) {
      setTickers(null);
      setTopics(null);
      setProfiles(null);
      setGuilds(null);
      setDaos(null);
      setMostTraded(null);
      setMostLoved(null);
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

    void fetchDiscoverProfiles('', viewerKey, 0)
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

    void client.query.groups
      .browse({ publicOnly: true, limit: SECTION_LIMIT })
      .then((page) => {
        if (cancelled) return;
        setGuilds(
          page.items.map((g) => ({
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

    void fetchMostTradedPeeks(client)
      .then((rows) => {
        if (cancelled) return;
        setMostTraded(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setMostTraded([]);
      });

    void fetchMostLovedPeeks(client)
      .then((rows) => {
        if (cancelled) return;
        setMostLoved(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setMostLoved([]);
      });

    return () => {
      cancelled = true;
    };
  }, [viewerKey]);

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

  const allSettled =
    tickers !== null &&
    topics !== null &&
    profiles !== null &&
    guilds !== null &&
    daos !== null &&
    mostTraded !== null &&
    mostLoved !== null;
  const empty =
    allSettled &&
    tickers.length === 0 &&
    topics.length === 0 &&
    profiles.length === 0 &&
    guilds.length === 0 &&
    daos.length === 0 &&
    mostTraded.length === 0 &&
    mostLoved.length === 0;
  const anyLoading =
    tickers === null ||
    topics === null ||
    profiles === null ||
    guilds === null ||
    daos === null ||
    mostTraded === null ||
    mostLoved === null;

  return (
    <div
      id="discover-panel-trending"
      className="discover-trending-panel"
      role="tabpanel"
      aria-labelledby="discover-tab-trending"
      aria-busy={anyLoading || undefined}
    >
      {anyLoading ? (
        <p className="sr-only">Loading trending…</p>
      ) : null}

      {empty ? (
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">Nothing trending yet.</p>
          <p className="standing-panel-empty-secondary">
            Open Profiles, DAOs, Guilds, Hubs, Topics, or Tickers to browse the
            graph.
          </p>
        </div>
      ) : null}

      {tickers === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : tickers.length > 0 ? (
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
            {tickers.slice(0, 6).map((item) => (
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

      {topics === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : topics.length > 0 ? (
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
            {topics.slice(0, 6).map((item) => (
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

      {profiles === null ? (
        <DiscoverTrendingProfilesSectionSkeleton />
      ) : profiles.length > 0 ? (
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
            accounts={profiles}
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

      {daos === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : daos.length > 0 ? (
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
            {daos.map((dao) => {
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

      {guilds === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : guilds.length > 0 ? (
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
            {guilds.map((guild) => (
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

      {mostTraded === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : mostTraded.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Most traded</h2>
            <Link
              href={dropsPath({ sort: 'traded' })}
              className="discover-trending-see-all"
            >
              See all
            </Link>
          </div>
          <ul className="discover-focus-rows">
            {mostTraded.map((scarce) => (
              <li key={`traded-${scarce.collectionId}`}>
                <Link
                  href={collectionPath(scarce.collectionId)}
                  className="discover-focus-row"
                >
                  <span className="discover-focus-row-label">
                    {scarce.title?.trim() || scarce.collectionId}
                  </span>
                  {scarce.appId ? (
                    <span className="discover-focus-row-meta">{scarce.appId}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mostLoved === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : mostLoved.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Most loved</h2>
            <Link
              href={dropsPath({ sort: 'loved' })}
              className="discover-trending-see-all"
            >
              See all
            </Link>
          </div>
          <ul className="discover-focus-rows">
            {mostLoved.map((scarce) => (
              <li key={`loved-${scarce.collectionId}`}>
                <Link
                  href={collectionPath(scarce.collectionId)}
                  className="discover-focus-row"
                >
                  <span className="discover-focus-row-label">
                    {scarce.title?.trim() || scarce.collectionId}
                  </span>
                  {scarce.appId ? (
                    <span className="discover-focus-row-meta">{scarce.appId}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
