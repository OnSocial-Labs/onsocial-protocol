'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OsIconAction,
  PlusIcon,
  SearchField,
  UsersFillIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import {
  enrichIndexedGuildSummaryCards,
  guildSummaryCardFromBrowse,
  guildSummaryCardFromMembership,
} from '@/features/guilds/guild-facts';
import {
  GuildSummaryCard,
  type GuildSummaryCardModel,
} from '@/features/guilds/guild-summary-card';
import { HUB_CATEGORY_SUGGESTIONS } from '@/features/scarces/hub-categories';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { topicLabel } from '@/lib/topic-slug';

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

/** Name, id, description, and topics (tags). */
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
  topic: string | 'all'
): boolean {
  if (topic === 'all') return true;
  return (card.topics ?? []).some((tag) => tag === topic);
}

export function LiveGuildsIndexPanel({
  initialGuilds = null,
}: {
  initialGuilds?: GuildSummaryCardModel[] | null;
} = {}) {
  const { accountId, isConnected, isLoading: walletLoading } = useAppWallet();
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState<'all' | string>('all');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    () => (initialGuilds != null ? 'ready' : 'loading')
  );
  const [searchState, setSearchState] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [guilds, setGuilds] = useState<GuildSummaryCardModel[]>(
    () => initialGuilds ?? []
  );
  const [searchResults, setSearchResults] = useState<
    GuildSummaryCardModel[] | null
  >(null);
  const searchRequestRef = useRef(0);
  // Empty SSR list still counts as painted — soft-refresh, don't blank.
  const hasPaintedRef = useRef(initialGuilds != null);
  const toolbarHidden = useDockAutoHide(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft) || hasPaintedRef.current;
    if (!soft) {
      setLoadState('loading');
    }
    setError(null);
    setSearchResults(null);
    try {
      const client = createReadOnlyOnSocialClient();
      const membershipCards: GuildSummaryCardModel[] = [];

      if (accountId) {
        const { items } = await client.query.groups.membershipsBy(accountId, {
          limit: 50,
        });
        for (const row of items) {
          membershipCards.push(guildSummaryCardFromMembership(row));
        }
      }

      const { items: browseItems } = await client.query.groups.browse({
        publicOnly: !accountId,
        limit: 24,
      });
      const browseCards = browseItems.map((row) =>
        guildSummaryCardFromBrowse(row)
      );
      const merged = mergeGuildCards(membershipCards, browseCards);

      setGuilds(merged);
      setLoadState('ready');
      hasPaintedRef.current = true;

      // Indexer counts only — never N× getConfig/getStats on the list.
      void enrichIndexedGuildSummaryCards(client, merged).then((withCounts) => {
        setGuilds(withCounts);
      });
    } catch (cause) {
      if (!soft) {
        setLoadState('error');
        setError(
          cause instanceof Error ? cause.message : 'Could not load guilds.'
        );
      }
    }
  }, [accountId]);

  // Paint SSR public browse immediately; soft-merge memberships after wallet.
  useEffect(() => {
    if (walletLoading) return;
    queueMicrotask(() => {
      void load({ soft: hasPaintedRef.current });
    });
  }, [load, walletLoading]);

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      return;
    }

    const requestId = ++searchRequestRef.current;
    queueMicrotask(() => {
      setSearchState('loading');
    });

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const client = createReadOnlyOnSocialClient();
          const { items } = await client.query.groups.browse({
            query,
            publicOnly: !accountId,
            limit: 24,
          });
          if (searchRequestRef.current !== requestId) return;
          const searchCards = items.map((row) =>
            guildSummaryCardFromBrowse(row)
          );
          setSearchResults(
            await enrichIndexedGuildSummaryCards(client, searchCards)
          );
          setSearchState('idle');
        } catch {
          if (searchRequestRef.current !== requestId) return;
          setSearchResults([]);
          setSearchState('idle');
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [accountId, search]);

  const searchQuery = search.trim();
  if (!searchQuery && searchResults !== null) {
    setSearchResults(null);
  }
  if (!searchQuery && searchState !== 'idle') {
    setSearchState('idle');
  }

  const topicChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: Array<{ id: string; label: string }> = [
      { id: 'all', label: 'All' },
    ];
    for (const entry of HUB_CATEGORY_SUGGESTIONS) {
      seen.add(entry.id);
      chips.push({ id: entry.id, label: entry.label });
    }
    for (const guild of guilds) {
      const primary = guild.topics?.[0];
      if (!primary || seen.has(primary)) continue;
      seen.add(primary);
      chips.push({ id: primary, label: topicLabel(primary) ?? primary });
    }
    return chips;
  }, [guilds]);

  const visibleGuilds = useMemo(() => {
    let rows = guilds;
    if (searchQuery) {
      const needle = searchQuery.toLowerCase();
      const localMatches = guilds.filter((card) =>
        guildCardMatchesQuery(card, needle)
      );
      rows = searchResults
        ? mergeGuildCards(searchResults, localMatches)
        : localMatches;
    }
    if (topicFilter !== 'all') {
      rows = rows.filter((card) => guildMatchesTopic(card, topicFilter));
    }
    return rows;
  }, [guilds, searchQuery, searchResults, topicFilter]);

  const createAction = (
    <OsIconAction asChild ariaLabel="Create guild">
      <Link href="/groups/create" scroll={false}>
        <PlusIcon aria-hidden className="glass-sheet-close-icon" />
      </Link>
    </OsIconAction>
  );

  const filtering = Boolean(searchQuery) || topicFilter !== 'all';

  return (
    <OsAppScreen
      title="Guilds"
      leading={null}
      glassChrome
      actions={createAction}
      heading={
        <SearchField
          value={search}
          onValueChange={setSearch}
          placeholder="Search guilds"
          clearAriaLabel="Clear search"
          ariaLabel="Search guilds"
          className="discover-nav-search-field os-app-screen-search"
          leadingIcon={
            <UsersFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      toolbar={
        <div
          className={`os-app-chrome-rail market-listing-toolbar${
            toolbarHidden ? ' is-scroll-hidden' : ''
          }`}
        >
          <OsChipRail
            className="market-listing-filters guild-topic-filters"
            ariaLabel="Filter by topic"
            value={topicFilter}
            onValueChange={setTopicFilter}
            items={topicChips.map((chip) => ({
              id: chip.id,
              label: chip.label,
            }))}
          />
        </div>
      }
    >
      <div className="guilds-page">
        {loadState === 'loading' ? (
          <section className="guild-state-card">Loading guilds…</section>
        ) : null}

        {loadState === 'error' ? (
          <section className="guild-state-card is-error">
            <p>{error ?? 'Could not load guilds.'}</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'ready' && searchState === 'loading' ? (
          <section className="guild-state-card">Searching guilds…</section>
        ) : null}

        {loadState === 'ready' &&
        searchState !== 'loading' &&
        visibleGuilds.length === 0 ? (
          <div className="standing-panel-empty-block is-centered">
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">
                {filtering
                  ? 'No guilds match that search.'
                  : isConnected
                    ? 'No guilds yet.'
                    : 'Connect a wallet to see your guilds.'}
              </p>
              <p className="standing-panel-empty-secondary">
                {filtering
                  ? 'Try another name, topic, or guild ID.'
                  : isConnected
                    ? 'Create a guild or join one by URL.'
                    : 'Or search public guilds above.'}
              </p>
            </div>
            <div className="standing-panel-empty-actions">
              {!filtering ? (
                <Link
                  className="standing-panel-empty-action"
                  href="/groups/create"
                >
                  Create a guild
                </Link>
              ) : null}
              {topicFilter !== 'all' ? (
                <button
                  type="button"
                  className="standing-panel-empty-action"
                  onClick={() => setTopicFilter('all')}
                >
                  Clear topic
                </button>
              ) : null}
              {searchQuery ? (
                <button
                  type="button"
                  className="standing-panel-empty-action"
                  onClick={() => setSearch('')}
                >
                  Clear search
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {loadState === 'ready' &&
        searchState !== 'loading' &&
        visibleGuilds.length > 0 ? (
          <div className="guild-summary-card-grid">
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
    </OsAppScreen>
  );
}
