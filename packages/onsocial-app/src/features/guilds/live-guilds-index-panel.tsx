'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { guildSummaryCardFromMembership } from '@/features/guilds/guild-facts';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { GuildsLatestPostsPanel } from '@/features/guilds/guilds-latest-posts-panel';
import { guildPath } from '@/features/guilds/guilds-data';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { topicLabel } from '@/lib/topic-slug';

function GuildMineCard({ guild }: { guild: GuildSummaryCardModel }) {
  const title = guildDisplayName(guild.name, guild.groupId);
  const topic = guild.topics?.[0]
    ? (topicLabel(guild.topics[0]) ?? guild.topics[0])
    : 'Guild';
  return (
    <Link
      href={guildPath(guild.groupId)}
      className="launcher-mine-card"
      scroll={false}
      aria-label={title}
    >
      <span className="launcher-mine-crest" aria-hidden>
        {guild.avatarUrl ? (
          <img src={guild.avatarUrl} alt="" />
        ) : (
          <span className="launcher-mine-crest-fallback">
            {title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="launcher-mine-card-copy">
        <span className="launcher-mine-card-title">{title}</span>
        <span className="launcher-mine-card-meta">{topic}</span>
      </span>
    </Link>
  );
}

/**
 * Guilds launcher — one Home: mine (horizontal) + latest posts under a divider.
 * Network catalog find: header search → Discover → Guilds.
 */
export function LiveGuildsIndexPanel() {
  const { accountId } = useAppWallet();
  const [myGuilds, setMyGuilds] = useState<GuildSummaryCardModel[] | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const discoverGuildsHref = appDiscoverTabHref('guilds');

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => {
        setMyGuilds(null);
        setLoadError(null);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setMyGuilds(null);
        setLoadError(null);
      }
    });
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const { items } = await client.query.groups.membershipsBy(accountId, {
          limit: 50,
        });
        if (cancelled) return;
        setMyGuilds(items.map((row) => guildSummaryCardFromMembership(row)));
        setLoadError(null);
      } catch (cause) {
        if (cancelled) return;
        setMyGuilds(null);
        setLoadError(
          cause instanceof Error ? cause.message : 'Could not load guilds.'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, retryKey]);

  const myGuildsReady = myGuilds !== null;
  const showMineRail = Boolean(
    accountId && myGuildsReady && myGuilds.length > 0
  );
  const showPosts = showMineRail;

  const headerActions = (
    <>
      <OsIconAction asChild ariaLabel="Discover Guilds">
        <Link href={discoverGuildsHref} scroll={false}>
          <SearchIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
      <OsIconAction asChild ariaLabel="Create guild">
        <Link href="/groups/create" scroll={false}>
          <PlusIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
    </>
  );

  return (
    <OsAppScreen
      title="Guilds"
      subtitle="Your spaces"
      backFallbackHref="/"
      glassChrome
      actions={headerActions}
    >
      <div className="launcher-home">
        <section className="launcher-home-section" aria-label="My Guilds">
          <h2 className="launcher-home-heading">My Guilds</h2>
          {!accountId ? (
            <p className="launcher-home-empty">
              Connect to see guilds you’ve joined — or tap search to explore.
            </p>
          ) : loadError ? (
            <div className="launcher-home-empty-block">
              <p className="launcher-home-empty">{loadError}</p>
              <button
                type="button"
                className="launcher-home-retry"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          ) : !myGuildsReady ? (
            <p className="launcher-home-empty">Loading your guilds…</p>
          ) : myGuilds.length === 0 ? (
            <p className="launcher-home-empty">
              You haven’t joined a guild yet. Tap Search to explore, or + to
              start one.
            </p>
          ) : (
            <div className="launcher-mine-rail" role="list">
              {myGuilds.map((guild) => (
                <div key={guild.groupId} role="listitem">
                  <GuildMineCard guild={guild} />
                </div>
              ))}
            </div>
          )}
        </section>

        {showPosts ? (
          <>
            <Divider className="launcher-home-divider" />
            <section className="launcher-home-section" aria-label="Posts">
              <h2 className="launcher-home-heading">Posts</h2>
              <GuildsLatestPostsPanel
                accountId={accountId}
                myGuilds={myGuilds}
              />
            </section>
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
