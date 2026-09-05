'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MovingChipPeekSection,
  MovingCoverPeekSection,
  MovingFacePeekSection,
  MovingHubPeekSection,
  MovingPostPeekSection,
  MovingProposalPeekSection,
} from '@/features/discover/discover-moving-peeks';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import { homePlacePath, placeLabel } from '@/lib/post-place';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  emptyMovingBoard,
  loadMovingBoard,
  movingBoardFromSeed,
  type MovingBoard,
} from '@/lib/discover-moving-board';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';
import {
  discoverProposalHref,
  discoverTrendingFilterQuery,
  filterMovingActive,
  filterTrendingDrops,
  filterTrendingHubs,
  filterTrendingPlaces,
  filterTrendingPosts,
  filterTrendingProposals,
  filterTrendingTickers,
  filterTrendingTopics,
} from '@/lib/discover-trending-filter';
import {
  excludeMovingHubsAlreadySold,
  isMovingLandingPainted,
  mergeMovingMentions,
  movingPostedCountLabel,
  preferStandingPosters,
} from '@/lib/discover-moving';
import {
  canRefreshMovingBoard,
  MOVING_BOARD_POLL_MS,
  MOVING_CLOCK_TICK_MS,
} from '@/lib/discover-moving-live';
import { formatRelativePostTimestamp } from '@/lib/post-display';
import {
  getGlobalViewerStandingLedger,
  getGlobalViewerStandingLedgerVersion,
  subscribeGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';

const SECTION_LIMIT = 6;

/**
 * Default Discover landing: what's moving — heat, talk, last sale, mention, people.
 * Lifetime Topics / Tickers / Most traded live on those tabs. This page is a peek.
 * See all stays in Discover (Profiles, Hubs). No door to Home, Market, or Protocol.
 * First paint is one board — skeletons until every strip is ready.
 * While the tab stays open the board replaces as one room, clocks tick,
 * and Active shows last-window scale. People you stand with who just
 * posted rise first. No lifetime counts.
 */
export function DiscoverTrendingPanel({
  onOpenTab,
  initial = null,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
  initial?: DiscoverTrendingSeed | null;
}) {
  const { query, viewerAccountId } = useDiscoverPanel();
  const paintedSeed = isMovingLandingPainted(initial);
  const [board, setBoard] = useState<MovingBoard | null>(() =>
    paintedSeed ? movingBoardFromSeed(initial) : null
  );
  const [standingIds, setStandingIds] = useState<string[]>([]);
  const [standingLedgerVersion, setStandingLedgerVersion] = useState(
    getGlobalViewerStandingLedgerVersion
  );
  const [clockTick, setClockTick] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return subscribeGlobalViewerStandingLedger(() => {
      setStandingLedgerVersion(getGlobalViewerStandingLedgerVersion());
    });
  }, []);

  useEffect(() => {
    const tick = () => setClockTick((value) => value + 1);
    const id = window.setInterval(tick, MOVING_CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const os = createReadOnlyOnSocialClient();
    const viewer = viewerAccountId?.trim() || '';

    const loadStanding = async () => {
      if (!viewer) return [] as string[];
      try {
        return await os.query.standings.outgoing(viewer, { limit: 48 });
      } catch {
        return [] as string[];
      }
    };

    const refresh = async (soft: boolean, withStanding: boolean) => {
      if (
        cancelled ||
        !canRefreshMovingBoard({
          hidden:
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden',
          inFlight: inFlightRef.current,
        })
      ) {
        return;
      }
      inFlightRef.current = true;
      try {
        const [next, standing] = await Promise.all([
          loadMovingBoard(os),
          withStanding ? loadStanding() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setBoard(next);
        if (standing) setStandingIds(standing);
      } catch {
        if (cancelled || soft) return;
        setBoard(emptyMovingBoard());
      } finally {
        inFlightRef.current = false;
      }
    };

    void refresh(paintedSeed, true);
    const intervalId = window.setInterval(() => {
      void refresh(true, false);
    }, MOVING_BOARD_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true, false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paintedSeed, viewerAccountId]);

  const filterNeedle = discoverTrendingFilterQuery(query);
  const visibleTickers = useMemo(
    () => (board == null ? null : filterTrendingTickers(board.tickers, query)),
    [board, query]
  );
  const visibleTopics = useMemo(
    () => (board == null ? null : filterTrendingTopics(board.topics, query)),
    [board, query]
  );
  const visiblePlaces = useMemo(
    () => (board == null ? null : filterTrendingPlaces(board.places, query)),
    [board, query]
  );
  const visiblePosts = useMemo(
    () => (board == null ? null : filterTrendingPosts(board.posts, query)),
    [board, query]
  );
  const visibleTalkedAbout = useMemo(
    () =>
      board == null ? null : filterTrendingPosts(board.talkedAbout, query),
    [board, query]
  );
  const visibleJustSold = useMemo(
    () => (board == null ? null : filterTrendingDrops(board.justSold, query)),
    [board, query]
  );
  const standingFromLedger = useMemo(() => {
    const ids: string[] = [];
    for (const [id, entry] of getGlobalViewerStandingLedger()) {
      if (entry.standing && id.trim()) ids.push(id.trim());
    }
    return standingLedgerVersion >= 0 ? ids : ids;
  }, [standingLedgerVersion]);
  const visibleProfiles = useMemo(() => {
    if (board == null) return null;
    return preferStandingPosters(
      filterMovingActive(board.profiles, query),
      [...standingIds, ...standingFromLedger],
      SECTION_LIMIT
    );
  }, [board, query, standingFromLedger, standingIds]);
  const mentionNow = useMemo(() => new Date(), [clockTick]);
  const postedMeta =
    board == null
      ? null
      : movingPostedCountLabel(board.postedCount, board.postedCapped);
  const visibleHubs = useMemo(() => {
    if (board == null) return null;
    return excludeMovingHubsAlreadySold(
      filterTrendingHubs(board.hubs, query),
      visibleJustSold ?? []
    ).slice(0, SECTION_LIMIT);
  }, [board, query, visibleJustSold]);
  const visibleMentions = useMemo(() => {
    if (
      visibleTopics == null ||
      visibleTickers == null ||
      visiblePlaces == null
    ) {
      return null;
    }
    return mergeMovingMentions(
      visibleTopics,
      visibleTickers,
      visiblePlaces
    ).map((item) => {
      const time =
        item.lastTimestamp > 0
          ? formatRelativePostTimestamp(item.lastTimestamp, mentionNow)
          : undefined;
      if (item.kind === 'topic') {
        return {
          key: `h-${item.id}`,
          href: homeHashtagPath(item.id),
          label: `#${item.id}`,
          time,
        };
      }
      if (item.kind === 'ticker') {
        return {
          key: `k-${item.id}`,
          href: homeTickerPath(item.id),
          label: formatTickerDisplay(item.id),
          ticker: true,
          time,
        };
      }
      return {
        key: `p-${item.id}`,
        href: homePlacePath(item.id),
        label: placeLabel(item.id) ?? item.id,
        time,
      };
    });
  }, [mentionNow, visiblePlaces, visibleTickers, visibleTopics]);
  const visibleProposals = useMemo(
    () =>
      board == null ? null : filterTrendingProposals(board.proposals, query),
    [board, query]
  );

  const allSettled = board != null;
  const empty =
    allSettled &&
    (visibleMentions?.length ?? 0) === 0 &&
    (visibleProfiles?.length ?? 0) === 0 &&
    (visibleHubs?.length ?? 0) === 0 &&
    (visiblePosts?.length ?? 0) === 0 &&
    (visibleTalkedAbout?.length ?? 0) === 0 &&
    (visibleJustSold?.length ?? 0) === 0 &&
    (visibleProposals?.length ?? 0) === 0;
  const anyLoading = board == null;

  return (
    <div
      id="discover-panel-trending"
      className="discover-trending-panel"
      role="tabpanel"
      aria-labelledby="discover-tab-trending"
      aria-busy={anyLoading || undefined}
    >
      {anyLoading ? (
        <p className="sr-only">Loading what&apos;s moving…</p>
      ) : null}

      {empty ? (
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">
            {filterNeedle ? 'No matches.' : 'Nothing moving yet.'}
          </p>
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
      <MovingCoverPeekSection
        heading="Just sold"
        kind="sold"
        rows={visibleJustSold}
      />

      <MovingChipPeekSection heading="Mentioned" rows={visibleMentions} />

      <MovingFacePeekSection
        heading="Active"
        rows={visibleProfiles}
        meta={postedMeta}
        onSeeAll={() => onOpenTab('profiles')}
      />

      <MovingHubPeekSection
        heading="Hot hubs"
        rows={visibleHubs}
        onSeeAll={() => onOpenTab('hubs')}
      />

      <MovingProposalPeekSection
        heading="New proposals"
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
