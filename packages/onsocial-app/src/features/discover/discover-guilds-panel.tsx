'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListLoadError } from '@/components/panels/list-load-error';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
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
  const [pending, setPending] = useState(() => initialGuilds == null);
  const [searchPending, setSearchPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const searchRequestRef = useRef(0);
  const hasPaintedRef = useRef(initialGuilds != null);

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
    if (!searchQuery) return base;
    const needle = searchQuery.toLowerCase();
    const localMatches = base.filter((card) =>
      guildCardMatchesQuery(card, needle)
    );
    return activeSearchResults
      ? mergeGuildCards(activeSearchResults, localMatches)
      : localMatches;
  }, [activeSearchResults, browseGuilds, searchQuery]);

  const showSkeleton = browseGuilds == null && pending;
  const showSearchBusy = Boolean(searchQuery) && searchPending;
  const isSearchEmpty =
    Boolean(searchQuery) &&
    !searchPending &&
    visibleGuilds.length === 0 &&
    browseGuilds != null;

  return (
    <div
      id="discover-panel-guilds"
      role="tabpanel"
      aria-labelledby="discover-tab-guilds"
      className="standing-panel-body discover-guilds-panel"
    >
      <div className="discover-community-toolbar">
        <p className="daos-index-empty dao-discover-status">
          {searchQuery
            ? `Searching “${searchQuery}”`
            : 'Public guilds on this network'}
        </p>
        <DiscoverCommunityHandoff
          links={[
            { href: APP_GROUPS_PATH, label: 'Open Guilds' },
            { href: `${APP_GROUPS_PATH}/create`, label: 'Create' },
          ]}
        />
      </div>

      {error ? <ListLoadError message={error} onRetry={retry} /> : null}

      {showSkeleton || showSearchBusy ? (
        <p className="daos-index-empty">
          {showSearchBusy ? 'Searching guilds…' : 'Loading guilds…'}
        </p>
      ) : null}

      {!showSkeleton && !showSearchBusy && visibleGuilds.length === 0 ? (
        <div className="standing-panel-empty-block">
          <div className="standing-panel-empty-state">
            <p className="standing-panel-empty-primary">
              {isSearchEmpty
                ? 'No guilds match that search.'
                : 'No public guilds yet.'}
            </p>
            <p className="standing-panel-empty-secondary">
              {isSearchEmpty
                ? 'Try another name, topic, or guild ID.'
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
  );
}
