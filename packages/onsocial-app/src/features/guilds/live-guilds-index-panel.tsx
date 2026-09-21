'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Divider, OsIconAction, PlusIcon, SearchIcon } from '@onsocial/ui';
import {
  LauncherHomeMineStatus,
  LauncherHomeSection,
  LauncherMineCard,
  LauncherMineRail,
  LauncherMineRailSkeleton,
} from '@/components/launcher-home';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { LAUNCHER_HOME_PAGE_CLASS } from '@/lib/os-chrome-page';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { guildSummaryCardFromMembership } from '@/features/guilds/guild-facts';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { GuildsLatestPostsPanel } from '@/features/guilds/guilds-latest-posts-panel';
import { guildPath } from '@/features/guilds/guilds-data';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  readLauncherMineSession,
  writeLauncherMineSession,
} from '@/lib/launcher-mine-session';

/**
 * Guilds launcher — one Home: mine (horizontal) + latest posts under a divider.
 * Network catalog find: header search → Discover → Guilds.
 */
export function LiveGuildsIndexPanel() {
  const { accountId } = useAppWallet();
  const [myGuilds, setMyGuilds] = useState<GuildSummaryCardModel[] | null>(() =>
    readLauncherMineSession('guilds', accountId)
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const accountIdRef = useRef(accountId);
  const myGuildsRef = useRef(myGuilds);

  useEffect(() => {
    accountIdRef.current = accountId;
    myGuildsRef.current = myGuilds;
  }, [accountId, myGuilds]);

  useEffect(() => {
    return () => {
      writeLauncherMineSession({
        kind: 'guilds',
        accountId: accountIdRef.current,
        items: myGuildsRef.current,
      });
    };
  }, []);

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
    const restored = readLauncherMineSession<GuildSummaryCardModel>(
      'guilds',
      accountId
    );
    queueMicrotask(() => {
      if (cancelled) return;
      setMyGuilds(restored);
      setLoadError(null);
    });
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const { items } = await client.query.groups.membershipsBy(accountId, {
          limit: 50,
        });
        if (cancelled) return;
        const next = items.map((row) => guildSummaryCardFromMembership(row));
        setMyGuilds(next);
        writeLauncherMineSession({
          kind: 'guilds',
          accountId,
          items: next,
        });
        setLoadError(null);
      } catch (cause) {
        if (cancelled) return;
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
      dockBack
      backFallbackHref={OS_INDEX_LEAVE_HREF}
      glassChrome
      actions={headerActions}
    >
      <div className={LAUNCHER_HOME_PAGE_CLASS}>
        <LauncherHomeSection aria-label="My guilds">
          <LauncherHomeMineStatus
            connected={Boolean(accountId)}
            loading={!myGuildsReady}
            error={loadError}
            onRetry={() => setRetryKey((value) => value + 1)}
            emptyLoggedOut="Connect to see guilds you’ve joined — or tap search to explore."
            emptyNone="You haven’t joined a guild yet. Tap Search to explore, or + to start one."
            loadingLabel="Loading your guilds…"
            loadingSkeleton={<LauncherMineRailSkeleton count={4} />}
            hasItems={(myGuilds?.length ?? 0) > 0}
          >
            <LauncherMineRail>
              {(myGuilds ?? []).map((guild) => {
                const title = guildDisplayName(guild.name, guild.groupId);
                return (
                  <LauncherMineCard
                    key={guild.groupId}
                    href={guildPath(guild.groupId)}
                    seedId={guild.groupId}
                    title={title}
                    bannerUrl={guild.bannerUrl}
                    markUrl={guild.badgeUrl}
                    markVariant="badge"
                  />
                );
              })}
            </LauncherMineRail>
          </LauncherHomeMineStatus>
        </LauncherHomeSection>

        {showPosts ? (
          <>
            <Divider className="launcher-home-divider" />
            <LauncherHomeSection title="Latest">
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
