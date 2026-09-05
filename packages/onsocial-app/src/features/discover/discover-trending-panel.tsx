'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GovernanceEventRow,
  HashtagCount,
  PlaceCount,
  PostRow,
  TickerCount,
} from '@onsocial/sdk';
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
import { marketPath, protocolPath } from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { discoverPageToProfileListAccounts } from '@/lib/discover-profiles';
import type {
  DiscoverTrendingHub,
  DiscoverTrendingSeed,
} from '@/lib/discover-trending-server';
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
import { rankHubPeeks } from '@/features/discover/discover-community-ranking';
import {
  fetchJustSoldScarcePeeks,
  type DiscoverScarcePeek,
} from '@/features/discover/discover-scarce-peeks';
import { fetchTalkedAboutPosts } from '@/features/discover/discover-talked-about';
import {
  isMovingLandingPainted,
  mergeMovingMentions,
  movingActivePeeks,
  movingSectionFromSeed,
  recentPosterIds,
  selectHotPosts,
  type MovingActivePeek,
} from '@/lib/discover-moving';
import { formatRelativePostTimestamp } from '@/lib/post-display';

const SECTION_LIMIT = 6;
const ACTIVE_POST_POOL = 24;

/**
 * Default Discover landing: what's moving — heat, talk, last sale, mention, people.
 * Lifetime Topics / Tickers / Most traded live on those tabs. This page is a peek.
 * Sections settle independently; an empty first seed keeps skeletons reserved.
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

  const [tickers, setTickers] = useState<TickerCount[] | null>(() =>
    movingSectionFromSeed(initial?.movingTickers, paintedSeed)
  );
  const [topics, setTopics] = useState<HashtagCount[] | null>(() =>
    movingSectionFromSeed(initial?.movingTopics, paintedSeed)
  );
  const [places, setPlaces] = useState<PlaceCount[] | null>(() =>
    movingSectionFromSeed(initial?.places, paintedSeed)
  );
  const [profiles, setProfiles] = useState<MovingActivePeek[] | null>(() =>
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
  const [justSold, setJustSold] = useState<DiscoverScarcePeek[] | null>(() =>
    movingSectionFromSeed(initial?.justSold, paintedSeed)
  );
  const [proposals, setProposals] = useState<GovernanceEventRow[] | null>(() =>
    movingSectionFromSeed(initial?.proposals, paintedSeed)
  );
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
      setJustSold(null);
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

    void fetchJustSoldScarcePeeks(client, SECTION_LIMIT).then((rows) => {
      if (cancelled) return;
      setJustSold(rows);
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
  }, []);

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
        const accounts = await discoverPageToProfileListAccounts(client, {
          profiles: rows,
          viewer: null,
        });
        return movingActivePeeks(accounts, page.items, SECTION_LIMIT);
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
  }, []);

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
    () => (profiles == null ? null : filterMovingActive(profiles, query)),
    [profiles, query]
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
  const visibleJustSold = useMemo(
    () => (justSold == null ? null : filterTrendingDrops(justSold, query)),
    [justSold, query]
  );
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
      if (item.kind === 'topic') {
        return {
          key: `h-${item.id}`,
          href: homeHashtagPath(item.id),
          label: `#${item.id}`,
        };
      }
      if (item.kind === 'ticker') {
        return {
          key: `k-${item.id}`,
          href: homeTickerPath(item.id),
          label: formatTickerDisplay(item.id),
          ticker: true,
        };
      }
      return {
        key: `p-${item.id}`,
        href: homePlacePath(item.id),
        label: placeLabel(item.id) ?? item.id,
      };
    });
  }, [visiblePlaces, visibleTickers, visibleTopics]);
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
    visibleJustSold !== null &&
    visibleMentions !== null &&
    visibleProposals !== null;
  const empty =
    allSettled &&
    visibleMentions.length === 0 &&
    visibleProfiles.length === 0 &&
    visibleHubs.length === 0 &&
    visiblePosts.length === 0 &&
    visibleTalkedAbout.length === 0 &&
    visibleJustSold.length === 0 &&
    visibleProposals.length === 0;
  const anyLoading =
    visibleTickers === null ||
    visibleTopics === null ||
    visiblePlaces === null ||
    visibleHubs === null ||
    visiblePosts === null ||
    visibleTalkedAbout === null ||
    visibleJustSold === null ||
    visibleMentions === null ||
    visibleProfiles === null ||
    visibleProposals === null;

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
        seeAllHref={marketPath()}
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
