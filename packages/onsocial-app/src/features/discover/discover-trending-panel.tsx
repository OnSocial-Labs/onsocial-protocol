'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from '@/lib/discover-moving';
import { formatRelativePostTimestamp } from '@/lib/post-display';

const SECTION_LIMIT = 6;

/**
 * Default Discover landing: what's moving — heat, talk, last sale, mention, people.
 * Lifetime Topics / Tickers / Most traded live on those tabs. This page is a peek.
 * See all stays in Discover (Profiles, Hubs). No door to Home, Market, or Protocol.
 * First paint is one board — skeletons until every strip is ready.
 */
export function DiscoverTrendingPanel({
  onOpenTab,
  initial = null,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
  initial?: DiscoverTrendingSeed | null;
}) {
  const { query } = useDiscoverPanel();
  const paintedSeed = isMovingLandingPainted(initial);
  const [board, setBoard] = useState<MovingBoard | null>(() =>
    paintedSeed ? movingBoardFromSeed(initial) : null
  );

  useEffect(() => {
    let cancelled = false;
    const soft = paintedSeed;
    void loadMovingBoard(createReadOnlyOnSocialClient())
      .then((next) => {
        if (cancelled) return;
        setBoard(next);
      })
      .catch(() => {
        if (cancelled || soft) return;
        setBoard(emptyMovingBoard());
      });
    return () => {
      cancelled = true;
    };
  }, [paintedSeed]);

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
  const visibleProfiles = useMemo(() => {
    if (board == null) return null;
    return filterMovingActive(board.profiles, query).slice(0, SECTION_LIMIT);
  }, [board, query]);
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
          ? formatRelativePostTimestamp(item.lastTimestamp)
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
  }, [visiblePlaces, visibleTickers, visibleTopics]);
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
