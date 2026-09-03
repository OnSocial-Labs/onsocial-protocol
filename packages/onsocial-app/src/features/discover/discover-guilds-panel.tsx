'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListLoadError } from '@/components/panels/list-load-error';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { DiscoverCommunityListSkeleton } from '@/features/discover/discover-loading-skeleton';
import { DiscoverTabLead } from '@/features/discover/discover-tab-lead';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { discoverGuildsLead } from '@/lib/discover-tab-lead';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { GUILD_TOPIC_SUGGESTIONS } from '@/features/guilds/guild-config';
import {
  enrichIndexedGuildSummaryCards,
  guildSummaryCardFromBrowse,
} from '@/features/guilds/guild-facts';
import {
  GuildSummaryCard,
  type GuildSummaryCardModel,
} from '@/features/guilds/guild-summary-card';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { APP_GROUPS_PATH } from '@/lib/app-routes';
import {
  countPrimaryTopics,
  discoverTopicFiltersFromCounts,
  topicLabel,
  type DiscoverTopicFilter,
} from '@/lib/topic-slug';

const BROWSE_LIMIT = 24;
/** Same window as the guild list — enough for early chip census. */
const GUILD_TOPIC_CENSUS_LIMIT = 24;

function guildCardMatchesQuery(
  card: GuildSummaryCardModel,
  needle: string
): boolean {
  const displayName = guildDisplayName(card.name, card.groupId);
  if (card.groupId.toLowerCase().includes(needle)) return true;
  if (displayName.toLowerCase().includes(needle)) return true;
  if ((card.description ?? '').toLowerCase().includes(needle)) return true;
  return (card.topics ?? []).some((tag) => tag.toLowerCase().includes(needle));
}

function guildMatchesTopic(
  card: GuildSummaryCardModel,
  topic: DiscoverTopicFilter
): boolean {
  if (topic === 'all') return true;
  const primary = card.topics?.[0];
  return primary === topic;
}

function mergeGuildCards(
  primary: GuildSummaryCardModel[],
  secondary: GuildSummaryCardModel[]
): GuildSummaryCardModel[] {
  const seen = new Set(primary.map((card) => card.groupId));
  const merged = [...primary];
  for (const card of secondary) {
    if (seen.has(card.groupId)) continue;
    seen.add(card.groupId);
    merged.push(card);
  }
  return merged;
}

/**
 * Discover → Guilds — public browse/search. Create / manage live in the Guilds app.
 * Browse chips: used primary topics (curated + custom), omit empty.
 */
export function DiscoverGuildsPanel() {
  const { query, initialGuilds, scrollRootRef } = useDiscoverPanel();
  const { accountId } = useAppWallet();
  const searchQuery = discoverPeopleSearchQuery(query);

  const [browseGuilds, setBrowseGuilds] = useState<
    GuildSummaryCardModel[] | null
  >(() => initialGuilds);
  const [searchResults, setSearchResults] = useState<
    GuildSummaryCardModel[] | null
  >(null);
  const [topicFilter, setTopicFilter] = useState<DiscoverTopicFilter>('all');
  const [topicCounts, setTopicCounts] = useState<Map<string, number>>(
    () => new Map()
  );
  const [pending, setPending] = useState(() => initialGuilds == null);
  const [searchPending, setSearchPending] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(
    () => (initialGuilds?.length ?? 0) >= BROWSE_LIMIT
  );
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const searchRequestRef = useRef(0);
  const hasPaintedRef = useRef(initialGuilds != null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const moreLoadingRef = useRef(false);

  const browseOptions = useMemo(
    () => discoverTopicFiltersFromCounts(topicCounts, GUILD_TOPIC_SUGGESTIONS),
    [topicCounts]
  );
  const activeTopicFilter = useMemo((): DiscoverTopicFilter => {
    if (
      topicFilter !== 'all' &&
      !browseOptions.some((entry) => entry.id === topicFilter)
    ) {
      return 'all';
    }
    return topicFilter;
  }, [browseOptions, topicFilter]);

  useEffect(() => {
    let cancelled = false;
    const soft = hasPaintedRef.current;
    if (!soft) {
      queueMicrotask(() => {
        if (!cancelled) {
          setPending(true);
          setError(null);
        }
      });
    }

    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const { items, nextOffset } = await client.query.groups.browse({
          publicOnly: !accountId,
          sort: 'members',
          limit: GUILD_TOPIC_CENSUS_LIMIT,
          offset: 0,
        });
        if (cancelled) return;
        const cards = items.map((row) => guildSummaryCardFromBrowse(row));
        setTopicCounts(
          countPrimaryTopics(
            cards.map((card) => ({ topic: card.topics?.[0] ?? null }))
          )
        );
        const page = cards.slice(0, BROWSE_LIMIT);
        setBrowseGuilds(page);
        setHasMore(nextOffset != null);
        setPending(false);
        setError(null);
        hasPaintedRef.current = true;
        const withCounts = await enrichIndexedGuildSummaryCards(client, page);
        if (!cancelled) setBrowseGuilds(withCounts);
      } catch (cause) {
        if (cancelled) return;
        setPending(false);
        if (!soft) {
          setBrowseGuilds(null);
          setHasMore(false);
          setError(
            cause instanceof Error ? cause.message : 'Could not load guilds.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, reloadNonce]);

  const retry = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (moreLoadingRef.current || !hasMore || searchQuery) return;
    const offset = browseGuilds?.length ?? 0;
    if (offset === 0) return;
    moreLoadingRef.current = true;
    setMoreLoading(true);
    try {
      const client = createReadOnlyOnSocialClient();
      const { items, nextOffset } = await client.query.groups.browse({
        publicOnly: !accountId,
        sort: 'members',
        limit: BROWSE_LIMIT,
        offset,
      });
      const cards = items.map((row) => guildSummaryCardFromBrowse(row));
      setBrowseGuilds((prev) => [...(prev ?? []), ...cards]);
      setHasMore(nextOffset != null);
      const withCounts = await enrichIndexedGuildSummaryCards(client, cards);
      setBrowseGuilds((prev) => {
        if (!prev) return withCounts;
        const byId = new Map(withCounts.map((card) => [card.groupId, card]));
        return prev.map((card) => byId.get(card.groupId) ?? card);
      });
    } catch {
      setHasMore(false);
    } finally {
      moreLoadingRef.current = false;
      setMoreLoading(false);
    }
  }, [accountId, browseGuilds?.length, hasMore, searchQuery]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: !searchQuery && hasMore && !moreLoading && !pending,
    onIntersect: loadMore,
  });

  useEffect(() => {
    if (!searchQuery) {
      return;
    }

    const requestId = ++searchRequestRef.current;
    queueMicrotask(() => {
      setSearchPending(true);
    });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const client = createReadOnlyOnSocialClient();
          const { items } = await client.query.groups.browse({
            query: searchQuery,
            publicOnly: !accountId,
            sort: 'members',
            limit: BROWSE_LIMIT,
          });
          if (searchRequestRef.current !== requestId) return;
          const cards = items.map((row) => guildSummaryCardFromBrowse(row));
          setSearchResults(await enrichIndexedGuildSummaryCards(client, cards));
          setSearchPending(false);
        } catch {
          if (searchRequestRef.current !== requestId) return;
          setSearchResults([]);
          setSearchPending(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [accountId, searchQuery]);

  const activeSearchResults =
    searchQuery && !searchPending ? searchResults : null;

  const visibleGuilds = useMemo(() => {
    const base = browseGuilds ?? [];
    if (!searchQuery) {
      return base.filter((card) => guildMatchesTopic(card, activeTopicFilter));
    }
    const needle = searchQuery.toLowerCase();
    const localMatches = base.filter(
      (card) =>
        guildMatchesTopic(card, activeTopicFilter) &&
        guildCardMatchesQuery(card, needle)
    );
    const remote = (activeSearchResults ?? []).filter((card) =>
      guildMatchesTopic(card, activeTopicFilter)
    );
    return activeSearchResults
      ? mergeGuildCards(remote, localMatches)
      : localMatches;
  }, [activeSearchResults, activeTopicFilter, browseGuilds, searchQuery]);

  const showSkeleton = browseGuilds == null && pending;
  const isSearchEmpty =
    Boolean(searchQuery) &&
    !searchPending &&
    visibleGuilds.length === 0 &&
    browseGuilds != null;
  const isTopicEmpty =
    activeTopicFilter !== 'all' &&
    !searchQuery &&
    !searchPending &&
    visibleGuilds.length === 0 &&
    browseGuilds != null;
  const topicFilterLabel =
    browseOptions.find((entry) => entry.id === activeTopicFilter)?.label ??
    topicLabel(activeTopicFilter, GUILD_TOPIC_SUGGESTIONS) ??
    activeTopicFilter;

  return (
    <div
      id="discover-panel-guilds"
      role="tabpanel"
      aria-labelledby="discover-tab-guilds"
      className="standing-panel-body discover-guilds-panel"
    >
      <DiscoverTabLead
        links={[
          { href: APP_GROUPS_PATH, label: 'Open Guilds' },
          { href: `${APP_GROUPS_PATH}/create`, label: 'Create' },
        ]}
      >
        {discoverGuildsLead(
          searchQuery,
          activeTopicFilter !== 'all' ? topicFilterLabel : null
        )}
      </DiscoverTabLead>

      {browseOptions.length > 1 ? (
        <OsChipRail
          variant="browse"
          ariaLabel="Browse guilds by topic"
          items={browseOptions}
          value={activeTopicFilter}
          onValueChange={(next) => setTopicFilter(next as DiscoverTopicFilter)}
        />
      ) : null}

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showSkeleton ? (
        <DiscoverCommunityListSkeleton label="Loading guilds…" />
      ) : null}

      {!error &&
      !showSkeleton &&
      visibleGuilds.length === 0 &&
      (!searchQuery || isSearchEmpty) ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty
                ? 'No matches.'
                : isTopicEmpty
                  ? 'No guilds in this topic yet.'
                  : 'No public guilds yet.'}
            </p>
            {isSearchEmpty ? null : (
              <p className="standing-panel-empty-secondary">
                {isTopicEmpty
                  ? 'Pick All or another topic.'
                  : 'Create one in Guilds, or join by URL.'}
              </p>
            )}
          </div>
          {isSearchEmpty ? null : (
            <div className="standing-panel-empty-actions">
              {isTopicEmpty ? (
                <button
                  type="button"
                  className="standing-panel-empty-action"
                  onClick={() => setTopicFilter('all')}
                >
                  Show all guilds
                </button>
              ) : (
                <>
                  <Link
                    className="standing-panel-empty-action"
                    href={`${APP_GROUPS_PATH}/create`}
                    scroll={false}
                  >
                    Create a guild
                  </Link>
                  <Link
                    className="standing-panel-empty-action"
                    href={APP_GROUPS_PATH}
                    scroll={false}
                  >
                    Open Guilds
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {!showSkeleton && visibleGuilds.length > 0 ? (
        <div className="community-summary-card-grid">
          {visibleGuilds.map((guild) => (
            <GuildSummaryCard
              key={guild.groupId}
              guild={guild}
              variant="grid"
            />
          ))}
        </div>
      ) : null}

      {!searchQuery && (hasMore || moreLoading) ? (
        <div className="dao-discover-load-more">
          <div
            ref={loadMoreRef}
            className="protocol-feed-sentinel"
            aria-hidden
          />
          {moreLoading ? (
            <DiscoverCommunityListSkeleton
              label="Loading more guilds…"
              count={2}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
