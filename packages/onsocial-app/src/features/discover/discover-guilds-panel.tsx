'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListLoadError } from '@/components/panels/list-load-error';
import { DiscoverBrowseChipRail } from '@/features/discover/discover-browse-chip-rail';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
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
import { APP_GROUPS_PATH } from '@/lib/app-routes';
import {
  countPrimaryTopics,
  discoverTopicFiltersFromCounts,
  topicLabel,
  type DiscoverTopicFilter,
} from '@/lib/topic-slug';

const BROWSE_LIMIT = 24;

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
  const { query, clearSearch, initialGuilds } = useDiscoverPanel();
  const { accountId } = useAppWallet();
  const searchQuery = discoverPeopleSearchQuery(query);

  const [browseGuilds, setBrowseGuilds] = useState<GuildSummaryCardModel[] | null>(
    () => initialGuilds
  );
  const [searchResults, setSearchResults] = useState<
    GuildSummaryCardModel[] | null
  >(null);
  const [topicFilter, setTopicFilter] = useState<DiscoverTopicFilter>('all');
  const [pending, setPending] = useState(() => initialGuilds == null);
  const [searchPending, setSearchPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const searchRequestRef = useRef(0);
  const hasPaintedRef = useRef(initialGuilds != null);

  const topicCounts = useMemo(
    () =>
      countPrimaryTopics(
        (browseGuilds ?? []).map((card) => ({
          topic: card.topics?.[0] ?? null,
        }))
      ),
    [browseGuilds]
  );
  const browseOptions = useMemo(
    () =>
      discoverTopicFiltersFromCounts(topicCounts, GUILD_TOPIC_SUGGESTIONS),
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
        const { items } = await client.query.groups.browse({
          publicOnly: !accountId,
          sort: 'members',
          limit: BROWSE_LIMIT,
        });
        if (cancelled) return;
        const cards = items.map((row) => guildSummaryCardFromBrowse(row));
        setBrowseGuilds(cards);
        setPending(false);
        setError(null);
        hasPaintedRef.current = true;
        const withCounts = await enrichIndexedGuildSummaryCards(client, cards);
        if (!cancelled) setBrowseGuilds(withCounts);
      } catch (cause) {
        if (cancelled) return;
        setPending(false);
        if (!soft) {
          setBrowseGuilds([]);
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
            limit: BROWSE_LIMIT,
          });
          if (searchRequestRef.current !== requestId) return;
          const cards = items.map((row) => guildSummaryCardFromBrowse(row));
          setSearchResults(
            await enrichIndexedGuildSummaryCards(client, cards)
          );
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

  const activeSearchResults = searchQuery ? searchResults : null;

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
  const showSearchBusy = Boolean(searchQuery) && searchPending;
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
      <div className="discover-community-toolbar">
        <p className="launcher-home-empty dao-discover-status">
          {searchQuery
            ? `Searching “${searchQuery}”`
            : activeTopicFilter !== 'all'
              ? `Guilds · ${topicFilterLabel}`
              : 'Public guilds on this network'}
        </p>
        <DiscoverCommunityHandoff
          links={[
            { href: APP_GROUPS_PATH, label: 'Open Guilds' },
            { href: `${APP_GROUPS_PATH}/create`, label: 'Create' },
          ]}
        />
      </div>

      <DiscoverBrowseChipRail
        ariaLabel="Browse guilds by topic"
        options={browseOptions}
        value={activeTopicFilter}
        onChange={(next) => setTopicFilter(next as DiscoverTopicFilter)}
      />

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showSkeleton || showSearchBusy ? (
        <p className="launcher-home-empty">
          {showSearchBusy ? 'Searching guilds…' : 'Loading guilds…'}
        </p>
      ) : null}

      {!showSkeleton && !showSearchBusy && visibleGuilds.length === 0 ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty
                ? 'No guilds match that search.'
                : isTopicEmpty
                  ? 'No guilds in this topic yet.'
                  : 'No public guilds yet.'}
            </p>
            <p className="standing-panel-empty-secondary">
              {isSearchEmpty
                ? 'Try another name, topic, or guild ID.'
                : isTopicEmpty
                  ? 'Pick All or another topic.'
                  : 'Create one in Guilds, or join by URL.'}
            </p>
          </div>
          <div className="standing-panel-empty-actions">
            {isSearchEmpty ? (
              <button
                type="button"
                className="standing-panel-empty-action"
                onClick={clearSearch}
              >
                Clear search
              </button>
            ) : isTopicEmpty ? (
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
        </div>
      ) : null}

      {!showSkeleton && !showSearchBusy && visibleGuilds.length > 0 ? (
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
    </div>
  );
}
