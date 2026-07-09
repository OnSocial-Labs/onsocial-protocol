'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlusIcon, osIconActionClassName } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { SearchField } from '@/components/ui/search-field';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import {
  enrichGuildSummaryCards,
  guildSummaryCardFromBrowse,
  guildSummaryCardFromMembership,
} from '@/features/guilds/guild-facts';
import {
  GuildSummaryCard,
  type GuildSummaryCardModel,
} from '@/features/guilds/guild-summary-card';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { APP_HOME_PATH } from '@/lib/app-routes';

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

export function LiveGuildsIndexPanel() {
  const { accountId, isConnected, isLoading: walletLoading } = useAppWallet();
  const [search, setSearch] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [searchState, setSearchState] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [guilds, setGuilds] = useState<GuildSummaryCardModel[]>([]);
  const [searchResults, setSearchResults] = useState<
    GuildSummaryCardModel[] | null
  >(null);
  const searchRequestRef = useRef(0);

  const load = useCallback(async () => {
    setLoadState('loading');
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
      const browseCards = browseItems.map((row) => guildSummaryCardFromBrowse(row));
      const merged = mergeGuildCards(membershipCards, browseCards);

      setGuilds(merged);
      setLoadState('ready');

      void enrichGuildSummaryCards(client, merged).then((withFacts) => {
        setGuilds(withFacts);
      });
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error ? cause.message : 'Could not load guilds.'
      );
    }
  }, [accountId]);

  useEffect(() => {
    if (walletLoading) return;
    queueMicrotask(() => {
      void load();
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
          setSearchResults(
            await enrichGuildSummaryCards(
              client,
              items.map((row) => guildSummaryCardFromBrowse(row))
            )
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

  const visibleGuilds = useMemo(() => {
    if (!searchQuery) return guilds;
    if (searchResults) return searchResults;
    const needle = searchQuery.toLowerCase();
    return guilds.filter((card) => {
      const displayName = guildDisplayName(card.name, card.groupId);
      return (
        card.groupId.toLowerCase().includes(needle) ||
        displayName.toLowerCase().includes(needle) ||
        (card.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [guilds, searchQuery, searchResults]);

  const toolbar = (
    <SearchField
      value={search}
      onValueChange={setSearch}
      placeholder="Search guilds"
      ariaLabel="Search guilds"
      chrome="floating-panel"
    />
  );

  const createAction = (
    <Link
      href="/groups/create"
      className={osIconActionClassName}
      aria-label="Create guild"
    >
      <PlusIcon
        aria-hidden
        className="glass-sheet-icon-action-glyph"
      />
    </Link>
  );

  return (
    <OsAppScreen
      title="Guilds"
      subtitle="Your spaces and open guilds on-chain."
      backFallbackHref={APP_HOME_PATH}
      actions={createAction}
      toolbar={toolbar}
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
          <section className="guild-state-card">
            <p className="guild-eyebrow">
              {search.trim() ? 'No matches' : 'No guilds yet'}
            </p>
            <h2>
              {search.trim()
                ? 'Try another name or guild ID.'
                : isConnected
                  ? 'Create a guild or join one by URL.'
                  : 'Connect a wallet to see your guilds, or search public ones.'}
            </h2>
            {!search.trim() ? (
              <Link className="guild-primary-link" href="/groups/create">
                Create a guild
              </Link>
            ) : null}
          </section>
        ) : null}

        {loadState === 'ready' &&
        searchState !== 'loading' &&
        visibleGuilds.length > 0 ? (
          <div className="guild-summary-card-grid">
            {visibleGuilds.map((guild) => (
              <GuildSummaryCard key={guild.groupId} guild={guild} variant="grid" />
            ))}
          </div>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
