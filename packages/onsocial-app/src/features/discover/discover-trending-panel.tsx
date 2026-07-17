'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import { ProfileSocialList } from '@/components/panels/profile-social-list';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { APP_GROUPS_PATH } from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  discoverProfileToProfileListAccount,
  fetchDiscoverProfiles,
} from '@/lib/discover-profiles';
import {
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';

const SECTION_LIMIT = 6;

type TrendingGuild = {
  groupId: string;
  groupName: string | null;
};

/**
 * Default Discover landing: mixed trending sections. Profiles use the same
 * social list rows as the Profiles tab (avatar, standing count, Stand).
 */
export function DiscoverTrendingPanel({
  onOpenTab,
}: {
  onOpenTab: (tab: DiscoverTab) => void;
}) {
  const {
    accountId: viewerAccountId,
    isConnected,
    connect,
  } = useAppWallet();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('discover');

  const [tickers, setTickers] = useState<TickerCount[]>([]);
  const [topics, setTopics] = useState<HashtagCount[]>([]);
  const [profiles, setProfiles] = useState<ProfileListAccount[]>([]);
  const [guilds, setGuilds] = useState<TrendingGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStandingIds, setPendingStandingIds] = useState<Set<string>>(
    () => new Set()
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const viewerKey = viewerAccountId ?? null;

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();

    void (async () => {
      setLoading(true);
      const [tickerRows, topicRows, profilePage, guildPage] = await Promise.all([
        client.query.tickers
          .trending({ limit: SECTION_LIMIT })
          .catch(() => [] as TickerCount[]),
        client.query.hashtags
          .trending({ limit: SECTION_LIMIT })
          .catch(() => [] as HashtagCount[]),
        fetchDiscoverProfiles('', viewerKey, 0).catch(() => null),
        client.query.groups
          .browse({ publicOnly: true, limit: SECTION_LIMIT })
          .catch(() => ({
            items: [] as Array<{ groupId: string; groupName: string | null }>,
          })),
      ]);

      if (cancelled) return;

      setTickers(tickerRows);
      setTopics(topicRows);
      setProfiles(
        (profilePage?.profiles ?? [])
          .slice(0, SECTION_LIMIT)
          .map(discoverProfileToProfileListAccount)
      );
      setGuilds(
        guildPage.items.map((g) => ({
          groupId: g.groupId,
          groupName: g.groupName,
        }))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerKey]);

  const isStandingPending = useCallback(
    (targetAccountId: string) =>
      pendingStandingIds.has(targetAccountId) ||
      isStandingPendingForTarget(targetAccountId),
    [isStandingPendingForTarget, pendingStandingIds]
  );

  const handleUpdateStanding = useCallback(
    async (account: ProfileListAccount, shouldStand: boolean) => {
      if (isStandingPending(account.accountId)) return;

      setActionError(null);
      setPendingStandingIds((prev) => new Set(prev).add(account.accountId));

      try {
        await updateStanding(
          profileListAccountToStandingSummary(account),
          shouldStand
        );
        setProfiles((current) =>
          current.map((profile) =>
            profile.accountId === account.accountId
              ? {
                  ...profile,
                  viewerStanding: shouldStand,
                  standingSince: shouldStand
                    ? (profile.standingSince ?? Date.now())
                    : null,
                  standingBlockTimestamp: shouldStand
                    ? (profile.standingBlockTimestamp ?? Date.now())
                    : null,
                  standingCount: Math.max(
                    0,
                    profile.standingCount +
                      (shouldStand === profile.viewerStanding
                        ? 0
                        : shouldStand
                          ? 1
                          : -1)
                  ),
                }
              : profile
          )
        );
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : 'Could not update standing.'
        );
      } finally {
        setPendingStandingIds((prev) => {
          const next = new Set(prev);
          next.delete(account.accountId);
          return next;
        });
      }
    },
    [isStandingPending, updateStanding]
  );

  const empty =
    !loading &&
    tickers.length === 0 &&
    topics.length === 0 &&
    profiles.length === 0 &&
    guilds.length === 0;

  return (
    <div
      id="discover-panel-trending"
      className="discover-trending-panel"
      role="tabpanel"
      aria-labelledby="discover-tab-trending"
    >
      {loading ? <div className="home-feed-state">Loading…</div> : null}

      {empty ? (
        <div className="standing-panel-empty-state">
          <p className="standing-panel-empty-primary">Nothing trending yet.</p>
          <p className="standing-panel-empty-secondary">
            Open Profiles, Topics, or Tickers to browse the graph.
          </p>
        </div>
      ) : null}

      {!loading && tickers.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Trending tickers</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('tickers')}
            >
              See all
            </button>
          </div>
          <div className="discover-trending-chips">
            {tickers.map((item) => (
              <Link
                key={`k-${item.ticker}`}
                href={homeTickerPath(item.ticker)}
                className="discover-trending-chip discover-trending-chip--ticker"
              >
                {formatTickerDisplay(item.ticker)}
                <span className="discover-trending-chip-count">
                  {item.postCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && topics.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Trending topics</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('topics')}
            >
              See all
            </button>
          </div>
          <div className="discover-trending-chips">
            {topics.map((item) => (
              <Link
                key={`h-${item.hashtag}`}
                href={homeHashtagPath(item.hashtag)}
                className="discover-trending-chip"
              >
                #{item.hashtag}
                <span className="discover-trending-chip-count">
                  {item.postCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && profiles.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Standing out</h2>
            <button
              type="button"
              className="discover-trending-see-all"
              onClick={() => onOpenTab('profiles')}
            >
              See all
            </button>
          </div>

          {!isConnected ? (
            <p className="discover-connect-hint">
              <button
                type="button"
                className="discover-connect-hint-action"
                onClick={() => void connect()}
              >
                Connect wallet
              </button>{' '}
              to stand with profiles.
            </p>
          ) : null}

          {actionError ? (
            <p className="standing-panel-error" role="alert">
              {actionError}
            </p>
          ) : null}

          <ProfileSocialList
            accounts={profiles}
            listKey="trending-profiles"
            viewerAccountId={viewerKey}
            showSolidarityBadge
            standingTimeMode="viewer-only"
            skeletonRowVariant="discover"
            viewerRelationshipsLoading={false}
            canUpdateStandingFor={(account) =>
              isConnected &&
              Boolean(viewerKey) &&
              viewerKey !== account.accountId
            }
            isPendingFor={isStandingPending}
            onUpdateStanding={(account, shouldStand) => {
              if (!viewerKey || viewerKey === account.accountId) return;
              void handleUpdateStanding(account, shouldStand);
            }}
            loadMoreSentinelRef={loadMoreRef}
            footerSummary={null}
            isLoadingMore={false}
            showLoadMoreSentinel={false}
          />
        </section>
      ) : null}

      {!loading && guilds.length > 0 ? (
        <section className="discover-trending-section">
          <div className="discover-trending-section-head">
            <h2 className="discover-trending-heading">Guilds</h2>
            <Link href={APP_GROUPS_PATH} className="discover-trending-see-all">
              See all
            </Link>
          </div>
          <ul className="discover-focus-rows">
            {guilds.map((guild) => (
              <li key={guild.groupId}>
                <Link
                  href={`${APP_GROUPS_PATH}/${encodeURIComponent(guild.groupId)}`}
                  className="discover-focus-row"
                >
                  <span className="discover-focus-row-label">
                    {guild.groupName?.trim() || guild.groupId}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
