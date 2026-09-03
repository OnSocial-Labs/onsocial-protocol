'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import {
  DiscoverTrendingChipSectionSkeleton,
  DiscoverTrendingGuildsSectionSkeleton,
  DiscoverTrendingProfilesSectionSkeleton,
} from '@/features/discover/discover-loading-skeleton';
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
  APP_HOME_PATH,
  appPath,
  collectionPath,
  dropsPath,
} from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { discoverPageToProfileListAccounts } from '@/lib/discover-profiles';
import {
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';
import type {
  DiscoverTrendingHub,
  DiscoverTrendingSeed,
} from '@/lib/discover-trending-server';
import {
  discoverProposalHref,
  discoverTrendingFilterQuery,
  filterTrendingDrops,
  filterTrendingHubs,
  filterTrendingPlaces,
  filterTrendingPosts,
  filterTrendingProfiles,
  filterTrendingProposals,
  filterTrendingTickers,
  filterTrendingTopics,
} from '@/lib/discover-trending-filter';
import {
  fetchMostLovedScarcePeeks,
  fetchMostTradedScarcePeeks,
  type DiscoverScarcePeek,
} from '@/features/discover/discover-scarce-peeks';
import { rankHubPeeks } from '@/features/discover/discover-community-ranking';
import {
  orderProfileSearchByPosterIds,
  recentPosterIds,
  selectHotPosts,
} from '@/lib/discover-moving';
import { formatPostPeekExcerpt } from '@/lib/post-display';
import { postThreadPath } from '@/lib/post-routes';

const SECTION_LIMIT = 6;
const ACTIVE_POST_POOL = 24;

function ScarcePeekSection({
  heading,
  seeAllHref,
  rows,
}: {
  heading: string;
  seeAllHref: string;
  rows: DiscoverScarcePeek[] | null;
}) {
  if (rows === null) {
    return <DiscoverTrendingGuildsSectionSkeleton />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="discover-trending-section" aria-label={heading}>
      <div className="discover-trending-section-head">
        <h2 className="discover-trending-heading">{heading}</h2>
        <Link href={seeAllHref} className="discover-trending-see-all">
          See all
        </Link>
      </div>
      <ul className="discover-focus-rows">
        {rows.map((scarce) => (
          <li key={`${heading}-${scarce.collectionId}`}>
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
  );
}

/**
 * Default Discover landing: what's moving — heat, recency, drops, people.
 * Face / hiring chips live on Profiles — this page is a peek, not a filter.
 * Sections paint independently as each query settles.
 */
export function DiscoverTrendingPanel({
  onOpenTab,
  initial = null,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
  initial?: DiscoverTrendingSeed | null;
}) {
  const { query } = useDiscoverPanel();
  const { accountId: viewerAccountId, isConnected, connect } = useAppWallet();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('discover');
  const { endorsementSyncVersion } = useViewerEndorsement('discover');

  const [tickers, setTickers] = useState<TickerCount[] | null>(
    () => initial?.movingTickers ?? null
  );
  const [topics, setTopics] = useState<HashtagCount[] | null>(
    () => initial?.movingTopics ?? null
  );
  const [places, setPlaces] = useState<PlaceCount[] | null>(
    () => initial?.places ?? null
  );
  const [profiles, setProfiles] = useState<ProfileListAccount[] | null>(
    () => initial?.profiles ?? null
  );
  const [hubs, setHubs] = useState<DiscoverTrendingHub[] | null>(
    () => initial?.hubs ?? null
  );
  const [posts, setPosts] = useState<PostRow[] | null>(
    () => initial?.posts ?? null
  );
  const [dropsTraded, setDropsTraded] = useState<DiscoverScarcePeek[] | null>(
    () => initial?.dropsTraded ?? null
  );
  const [dropsLoved, setDropsLoved] = useState<DiscoverScarcePeek[] | null>(
    () => initial?.dropsLoved ?? null
  );
  const [proposals, setProposals] = useState<GovernanceEventRow[] | null>(
    () => initial?.proposals ?? null
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const viewerKey = viewerAccountId ?? null;
  const hasPaintedRef = useRef(
    initial != null &&
      ((initial.movingTickers?.length ?? 0) > 0 ||
        (initial.movingTopics?.length ?? 0) > 0 ||
        (initial.places?.length ?? 0) > 0 ||
        initial.profiles.length > 0 ||
        initial.hubs.length > 0 ||
        (initial.posts?.length ?? 0) > 0 ||
        (initial.dropsTraded?.length ?? 0) > 0 ||
        (initial.dropsLoved?.length ?? 0) > 0 ||
        (initial.proposals?.length ?? 0) > 0)
  );

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    const soft = hasPaintedRef.current;

    if (!soft) {
      setTickers(null);
      setTopics(null);
      setPlaces(null);
      setHubs(null);
      setPosts(null);
      setDropsTraded(null);
      setDropsLoved(null);
      setProposals(null);
    }

    void client.query.feed
      .recent({ limit: SECTION_LIMIT, sort: 'hot', section: 'posts' })
      .then((page) => {
        if (cancelled) return;
        setPosts(selectHotPosts(page.items, SECTION_LIMIT));
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setPosts([]);
      });

    void client.query.tickers
      .trending({ limit: SECTION_LIMIT, sort: 'recent' })
      .then((rows) => {
        if (cancelled) return;
        setTickers(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setTickers([]);
      });

    void client.query.hashtags
      .trending({ limit: SECTION_LIMIT, sort: 'recent' })
      .then((rows) => {
        if (cancelled) return;
        setTopics(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setTopics([]);
      });

    void client.query.places
      .trending({ limit: SECTION_LIMIT, sort: 'recent' })
      .then((rows) => {
        if (cancelled) return;
        setPlaces(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setPlaces([]);
      });

    void rankHubPeeks(client, { peekLimit: SECTION_LIMIT })
      .then((rows) => {
        if (cancelled) return;
        setHubs(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setHubs([]);
      });

    void fetchMostTradedScarcePeeks(client, SECTION_LIMIT).then((rows) => {
      if (cancelled) return;
      setDropsTraded(rows);
      hasPaintedRef.current = true;
    });

    void fetchMostLovedScarcePeeks(client, SECTION_LIMIT).then((rows) => {
      if (cancelled) return;
      setDropsLoved(rows);
      hasPaintedRef.current = true;
    });

    void client.query.governance
      .recentProposals({ limit: SECTION_LIMIT })
      .then((rows) => {
        if (cancelled) return;
        setProposals(rows);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setProposals([]);
      });

    return () => {
      cancelled = true;
    };
  }, [viewerKey]);

  useEffect(() => {
    let cancelled = false;
    const soft = hasPaintedRef.current;
    const client = createReadOnlyOnSocialClient();
    void client.query.feed
      .recent({ limit: ACTIVE_POST_POOL, section: 'posts' })
      .then(async (page) => {
        const ids = recentPosterIds(page.items, SECTION_LIMIT);
        if (ids.length === 0) return [];
        const rows = await client.query.profiles.statsForAccounts(ids);
        return discoverPageToProfileListAccounts(client, {
          profiles: orderProfileSearchByPosterIds(rows, ids),
          viewer: null,
        });
      })
      .then((next) => {
        if (cancelled) return;
        setProfiles(next);
        hasPaintedRef.current = true;
      })
      .catch(() => {
        if (!cancelled && !soft) setProfiles([]);
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
          error instanceof Error ? error.message : 'Could not update standing.'
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
  const visibleHubs = useMemo(
    () => (hubs == null ? null : filterTrendingHubs(hubs, query)),
    [hubs, query]
  );
  const visiblePosts = useMemo(
    () => (posts == null ? null : filterTrendingPosts(posts, query)),
    [posts, query]
  );
  const visibleDropsTraded = useMemo(
    () =>
      dropsTraded == null ? null : filterTrendingDrops(dropsTraded, query),
    [dropsTraded, query]
  );
  const visibleDropsLoved = useMemo(
    () => (dropsLoved == null ? null : filterTrendingDrops(dropsLoved, query)),
    [dropsLoved, query]
  );
  const visibleProposals = useMemo(
    () =>
      proposals == null ? null : filterTrendingProposals(proposals, query),
    [proposals, query]
  );

  const allSettled =
    visibleTickers !== null &&
    visibleTopics !== null &&
    visiblePlaces !== null &&
    visibleProfiles !== null &&
    visibleHubs !== null &&
    visiblePosts !== null &&
    visibleDropsTraded !== null &&
    visibleDropsLoved !== null &&
    visibleProposals !== null;
  const empty =
    allSettled &&
    visibleTickers.length === 0 &&
    visibleTopics.length === 0 &&
    visiblePlaces.length === 0 &&
    visibleProfiles.length === 0 &&
    visibleHubs.length === 0 &&
    visiblePosts.length === 0 &&
    visibleDropsTraded.length === 0 &&
    visibleDropsLoved.length === 0 &&
    visibleProposals.length === 0;
  const anyLoading =
    visibleTickers === null ||
    visibleTopics === null ||
    visiblePlaces === null ||
    visibleProfiles === null ||
    visibleHubs === null ||
    visiblePosts === null ||
    visibleDropsTraded === null ||
    visibleDropsLoved === null ||
    visibleProposals === null;

  return (
    <div
      id="discover-panel-trending"
      className="discover-trending-panel"
      role="tabpanel"
      aria-labelledby="discover-tab-trending"
      aria-busy={anyLoading || undefined}
    >
      <DiscoverTabLead>{discoverTrendingLead()}</DiscoverTabLead>

      {anyLoading ? <p className="sr-only">Loading what&apos;s moving…</p> : null}

      {empty ? (
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">
            {filterNeedle ? 'No matches.' : 'Nothing moving yet.'}
          </p>
          {filterNeedle ? null : (
            <p className="standing-panel-empty-secondary">
              Open Profiles, Guilds, Hubs, DAOs, Topics, or Tickers to browse.
            </p>
          )}
        </div>
      ) : null}

      {visiblePosts === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : visiblePosts.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Hot posts</h2>
            <Link href={APP_HOME_PATH} className="discover-trending-see-all">
              See all
            </Link>
          </div>
          <ul className="discover-focus-rows">
            {visiblePosts.slice(0, SECTION_LIMIT).map((post) => {
              const excerpt = formatPostPeekExcerpt(post.value, {
                kind: post.kind,
                postId: post.postId,
              });
              const author = post.authorName?.trim() || post.accountId;
              return (
                <li key={`${post.accountId}-${post.postId}`}>
                  <Link
                    href={postThreadPath(post)}
                    className="discover-focus-row"
                  >
                    <span className="discover-focus-row-label">{excerpt}</span>
                    <span className="discover-focus-row-meta">{author}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {visibleTopics === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : visibleTopics.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Topics</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('topics')}
            >
              See all
            </button>
          </div>
          <div className="discover-trending-chips">
            {visibleTopics.slice(0, SECTION_LIMIT).map((item) => (
              <Link
                key={`h-${item.hashtag}`}
                href={homeHashtagPath(item.hashtag)}
                className="discover-trending-chip"
              >
                #{item.hashtag}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {visibleTickers === null ? (
        <DiscoverTrendingChipSectionSkeleton />
      ) : visibleTickers.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Tickers</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('tickers')}
            >
              See all
            </button>
          </div>
          <div className="discover-trending-chips">
            {visibleTickers.slice(0, SECTION_LIMIT).map((item) => (
              <Link
                key={`k-${item.ticker}`}
                href={homeTickerPath(item.ticker)}
                className="discover-trending-chip discover-trending-chip--ticker"
              >
                {formatTickerDisplay(item.ticker)}
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
            <h2 className="discover-trending-heading">Places</h2>
          </div>
          <div className="discover-trending-chips">
            {visiblePlaces.slice(0, SECTION_LIMIT).map((item) => (
              <Link
                key={`p-${item.place}`}
                href={homePlacePath(item.place)}
                className="discover-trending-chip"
              >
                {placeLabel(item.place) ?? item.place}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <ScarcePeekSection
        heading="Most traded"
        seeAllHref={dropsPath({ sort: 'traded' })}
        rows={visibleDropsTraded}
      />
      <ScarcePeekSection
        heading="Most loved"
        seeAllHref={dropsPath({ sort: 'loved' })}
        rows={visibleDropsLoved}
      />

      {visibleProfiles === null ? (
        <DiscoverTrendingProfilesSectionSkeleton />
      ) : visibleProfiles.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Active</h2>
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

      {visibleHubs === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : visibleHubs.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Hot hubs</h2>
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

      {visibleProposals === null ? (
        <DiscoverTrendingGuildsSectionSkeleton />
      ) : visibleProposals.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">New proposals</h2>
          </div>
          <ul className="discover-focus-rows">
            {visibleProposals.slice(0, SECTION_LIMIT).map((row) => {
              const href = discoverProposalHref(row);
              const title = row.title?.trim() || 'Proposal';
              const meta = row.groupId?.trim() || row.proposalType?.trim() || '';
              if (!href) return null;
              return (
                <li
                  key={`${row.groupId ?? 'g'}-${row.proposalId ?? row.blockHeight}`}
                >
                  <Link href={href} className="discover-focus-row">
                    <span className="discover-focus-row-label">{title}</span>
                    {meta ? (
                      <span className="discover-focus-row-meta">{meta}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
