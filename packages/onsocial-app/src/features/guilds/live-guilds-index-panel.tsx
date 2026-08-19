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
      className="daos-mine-card"
      scroll={false}
      aria-label={title}
    >
      <span className="daos-mine-crest" aria-hidden>
        {guild.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- crest thumbnail
          <img src={guild.avatarUrl} alt="" />
        ) : (
          <span className="daos-mine-crest-fallback">
            {title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="daos-mine-card-copy">
        <span className="daos-mine-card-title">{title}</span>
        <span className="daos-mine-card-meta">{topic}</span>
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

  const discoverGuildsHref = appDiscoverTabHref('guilds');

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => setMyGuilds(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMyGuilds(null);
    });
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const { items } = await client.query.groups.membershipsBy(accountId, {
          limit: 50,
        });
        if (cancelled) return;
        setMyGuilds(items.map((row) => guildSummaryCardFromMembership(row)));
      } catch {
        if (!cancelled) setMyGuilds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const myGuildsReady = myGuilds !== null;
  const showMineRail = Boolean(
    accountId && myGuildsReady && myGuilds.length > 0
  );
  /** Posts only once you're in — no tutorial empty under the divider. */
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
      <div className="daos-index">
        <section className="daos-index-section" aria-label="My Guilds">
          <h2 className="daos-index-heading">My Guilds</h2>
          {!accountId ? (
            <p className="daos-index-empty">
              Connect to see guilds you’ve joined — or tap search to explore.
            </p>
          ) : !myGuildsReady ? (
            <p className="daos-index-empty">Loading your guilds…</p>
          ) : myGuilds.length === 0 ? (
            <p className="daos-index-empty">
              You haven’t joined a guild yet. Tap Search to explore, or + to
              start one.
            </p>
          ) : (
            <div className="daos-mine-rail" role="list">
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
            <Divider className="daos-index-divider" />
            <section className="daos-index-section" aria-label="Posts">
              <h2 className="daos-index-heading">Posts</h2>
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
