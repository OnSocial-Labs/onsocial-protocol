'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import { DiscoverTrendingProfilesSectionSkeleton } from '@/features/discover/discover-loading-skeleton';
import {
  MovingChipPeekSection,
  MovingCoverPeekSection,
  MovingHubPeekSection,
  MovingPostPeekSection,
  MovingProposalPeekSection,
  MovingSectionHead,
} from '@/features/discover/discover-moving-peeks';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { OsAppChromePageStatus } from '@onsocial/ui';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import {
  DISCOVER_CONNECT_HINT,
  discoverTrendingLead,
} from '@/lib/discover-tab-lead';
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
import { APP_HOME_PATH, dropsPath, protocolPath } from '@/lib/app-routes';
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
import { fetchTalkedAboutPosts } from '@/features/discover/discover-talked-about';
import {
  isMovingLandingPainted,
  movingSectionFromSeed,
  orderProfileSearchByPosterIds,
  recentPosterIds,
  selectHotPosts,
} from '@/lib/discover-moving';
import { formatRelativePostTimestamp } from '@/lib/post-display';

const SECTION_LIMIT = 6;
const ACTIVE_POST_POOL = 24;

/**
 * Default Discover landing: what's moving — heat, talk, recency, drops, people.
 * Face / hiring chips live on Profiles — this page is a peek, not a filter.
 * Sections settle independently; an empty first seed keeps skeletons reserved.
 */
export function DiscoverTrendingPanel({
  onOpenTab,
  initial = null,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
  initial?: DiscoverTrendingSeed | null;
}) {
  const { query, showConnectHint } = useDiscoverPanel();
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('discover');
  const { endorsementSyncVersion } = useViewerEndorsement('discover');
  const paintedSeed = isMovingLandingPainted(initial);

  const [tickers, setTickers] = useState<TickerCount[] | null>(() =>
    movingSectionFromSeed(initial?.movingTickers, paintedSeed)
  );
  const [topics, setTopics] = useState<HashtagCount[] | null>(() =>
    movingSectionFromSeed(initial?.movingTopics, paintedSeed)
  );
  const [places, setPlaces] = useState<PlaceCount[] | null>(() =>
    movingSectionFromSeed(initial?.places, paintedSeed)
  );
  const [profiles, setProfiles] = useState<ProfileListAccount[] | null>(() =>
    movingSectionFromSeed(initial?.profiles, paintedSeed)
  );
  const [hubs, setHubs] = useState<DiscoverTrendingHub[] | null>(() =>
    movingSectionFromSeed(initial?.hubs, paintedSeed)
  );
  const [posts, setPosts] = useState<PostRow[] | null>(() =>
    movingSectionFromSeed(initial?.posts, paintedSeed)
  );
  const [talkedAbout, setTalkedAbout] = useState<PostRow[] | null>(() =>
    movingSectionFromSeed(initial?.talkedAbout, paintedSeed)
  );
  const [dropsTraded, setDropsTraded] = useState<DiscoverScarcePeek[] | null>(
    () => movingSectionFromSeed(initial?.dropsTraded, paintedSeed)
  );
  const [dropsLoved, setDropsLoved] = useState<DiscoverScarcePeek[] | null>(
    () => movingSectionFromSeed(initial?.dropsLoved, paintedSeed)
  );
  const [proposals, setProposals] = useState<GovernanceEventRow[] | null>(() =>
    movingSectionFromSeed(initial?.proposals, paintedSeed)
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const viewerKey = viewerAccountId ?? null;
  const hasPaintedRef = useRef(paintedSeed);

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
      setTalkedAbout(null);
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

    void fetchTalkedAboutPosts(client, SECTION_LIMIT).then((rows) => {
      if (cancelled) return;
      setTalkedAbout(rows);
      hasPaintedRef.current = true;
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
  const visibleTalkedAbout = useMemo(
    () =>
      talkedAbout == null ? null : filterTrendingPosts(talkedAbout, query),
    [query, talkedAbout]
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
    visibleTalkedAbout !== null &&
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
    visibleTalkedAbout.length === 0 &&
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
    visibleTalkedAbout === null ||
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

      {anyLoading ? (
        <p className="sr-only">Loading what&apos;s moving…</p>
      ) : null}

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

      <MovingPostPeekSection
        heading="Hot posts"
        why="hot"
        rows={visiblePosts}
      />
      <MovingPostPeekSection
        heading="Talked about"
        why="talk"
        rows={visibleTalkedAbout}
      />

      <MovingChipPeekSection
        heading="Topics"
        seeAll={{ onClick: () => onOpenTab('topics') }}
        rows={
          visibleTopics == null
            ? null
            : visibleTopics.map((item) => ({
                key: `h-${item.hashtag}`,
                href: homeHashtagPath(item.hashtag),
                label: `#${item.hashtag}`,
                count: item.postCount,
              }))
        }
      />
      <MovingChipPeekSection
        heading="Tickers"
        seeAll={{ onClick: () => onOpenTab('tickers') }}
        rows={
          visibleTickers == null
            ? null
            : visibleTickers.map((item) => ({
                key: `k-${item.ticker}`,
                href: homeTickerPath(item.ticker),
                label: formatTickerDisplay(item.ticker),
                count: item.postCount,
                ticker: true,
              }))
        }
      />
      <MovingChipPeekSection
        heading="Places"
        seeAll={{ href: APP_HOME_PATH }}
        rows={
          visiblePlaces == null
            ? null
            : visiblePlaces.map((item) => ({
                key: `p-${item.place}`,
                href: homePlacePath(item.place),
                label: placeLabel(item.place) ?? item.place,
                count: item.postCount,
              }))
        }
      />

      <MovingCoverPeekSection
        heading="Most traded"
        seeAllHref={dropsPath({ sort: 'traded' })}
        kind="traded"
        rows={visibleDropsTraded}
      />
      <MovingCoverPeekSection
        heading="Most loved"
        seeAllHref={dropsPath({ sort: 'loved' })}
        kind="loved"
        rows={visibleDropsLoved}
      />

      {visibleProfiles === null ? (
        <DiscoverTrendingProfilesSectionSkeleton />
      ) : visibleProfiles.length > 0 ? (
        <section className="discover-trending-section">
          <MovingSectionHead
            heading="Active"
            seeAll={{ onClick: () => onOpenTab('profiles') }}
          />

          {showConnectHint ? (
            <OsAppChromePageStatus className="discover-connect-hint">
              {DISCOVER_CONNECT_HINT}
            </OsAppChromePageStatus>
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

      <MovingHubPeekSection
        heading="Hot hubs"
        rows={visibleHubs}
        onSeeAll={() => onOpenTab('hubs')}
      />

      <MovingProposalPeekSection
        heading="New proposals"
        seeAllHref={protocolPath()}
        rows={
          visibleProposals == null
            ? null
            : visibleProposals.flatMap((row) => {
                const href = discoverProposalHref(row);
                if (!href) return [];
                return [
                  {
                    key: `${row.groupId ?? 'g'}-${row.proposalId ?? row.blockHeight}`,
                    href,
                    title: row.title?.trim() || 'Proposal',
                    status: row.status,
                    proposalType: row.proposalType,
                    groupId: row.groupId,
                    timeLabel: formatRelativePostTimestamp(row.blockTimestamp),
                  },
                ];
              })
        }
      />
    </div>
  );
}
