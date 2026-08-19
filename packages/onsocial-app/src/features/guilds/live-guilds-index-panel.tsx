'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import {
  LauncherHomeMineStatus,
  LauncherHomeSection,
  LauncherMineCard,
  LauncherMineRail,
} from '@/components/launcher-home';
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
        <LauncherHomeSection title="My Guilds">
          <LauncherHomeMineStatus
            connected={Boolean(accountId)}
            loading={!myGuildsReady}
            error={loadError}
            onRetry={() => setRetryKey((value) => value + 1)}
            emptyLoggedOut="Connect to see guilds you’ve joined — or tap search to explore."
            emptyNone="You haven’t joined a guild yet. Tap Search to explore, or + to start one."
            loadingLabel="Loading your guilds…"
            hasItems={(myGuilds?.length ?? 0) > 0}
          >
            <LauncherMineRail>
              {(myGuilds ?? []).map((guild) => {
                const title = guildDisplayName(guild.name, guild.groupId);
                const meta = guild.topics?.[0]
                  ? (topicLabel(guild.topics[0]) ?? guild.topics[0])
                  : 'Guild';
                return (
                  <LauncherMineCard
                    key={guild.groupId}
                    href={guildPath(guild.groupId)}
                    title={title}
                    meta={meta}
                    imageUrl={guild.bannerUrl}
                  />
                );
              })}
            </LauncherMineRail>
          </LauncherHomeMineStatus>
        </LauncherHomeSection>

        {showPosts ? (
          <>
            <Divider className="launcher-home-divider" />
            <LauncherHomeSection title="Posts">
              <GuildsLatestPostsPanel
                accountId={accountId}
                myGuilds={myGuilds}
              />
            </LauncherHomeSection>
          </>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
