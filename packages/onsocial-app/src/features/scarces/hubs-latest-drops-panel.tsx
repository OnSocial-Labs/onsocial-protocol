'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherSocialPeekList,
  LauncherSocialPeekRow,
  LauncherSocialPeekSkeleton,
  launcherPeekOverflowLabel,
  LAUNCHER_PEEK_DISPLAY_LIMIT,
} from '@/components/launcher-home';
import type { AppView } from '@/features/scarces/apps-data';
import { collectionCurrentRowToView } from '@/features/scarces/collections-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { appDiscoverTabHref } from '@/features/discover/discover-tabs';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { collectionPath } from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const HUB_DROP_LIMIT = 24;
const PEEK_FETCH_LIMIT = 24;

export type HubDropPeek = {
  key: string;
  appId: string;
  hubName: string;
  creatorId: string;
  collectionId: string;
  title: string;
  createdAtMs: number;
  href: string;
};

/**
 * Membership-scoped drop peeks under Hubs Home (one batched catalog query).
 */
export function HubsLatestDropsPanel({
  accountId,
  myHubs,
}: {
  accountId: string | null;
  myHubs: AppView[] | null;
}) {
  const [peeks, setPeeks] = useState<HubDropPeek[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const hubIds = useMemo(() => {
    if (!myHubs) return [];
    return myHubs
      .map((row) => row.appId.trim())
      .filter(Boolean)
      .slice(0, HUB_DROP_LIMIT);
  }, [myHubs]);

  const hubNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const hub of myHubs ?? []) {
      map.set(hub.appId, hub.title.trim() || hub.appId);
    }
    return map;
  }, [myHubs]);

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(false);
        setError(null);
      });
      return;
    }
    if (myHubs == null) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(true);
        setError(null);
      });
      return;
    }
    if (hubIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        setPending(false);
        setError(null);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });

    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const rows = await client.query.scarces.collectionsCurrent({
          appIds: hubIds,
          limit: PEEK_FETCH_LIMIT,
        });
        if (cancelled) return;
        const mapped = rows
          .map((row) => {
            const view = collectionCurrentRowToView(row);
            if (!view) return null;
            const appId = view.appId?.trim() || '';
            const creatorId = view.creatorId?.trim();
            if (!creatorId) return null;
            return {
              key: `${appId}:${view.collectionId}`,
              appId,
              hubName: hubNameById.get(appId) ?? (appId || 'Hub'),
              creatorId,
              collectionId: view.collectionId,
              title: (view.title || view.collectionId).trim().slice(0, 120),
              createdAtMs: view.createdAtMs || 0,
              href: collectionPath(view.collectionId),
            } satisfies HubDropPeek;
          })
          .filter((row): row is HubDropPeek => row != null);
        setPeeks(mapped);
        setPending(false);
      } catch (cause) {
        if (cancelled) return;
        setPeeks(null);
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Could not load drops.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, hubIds, hubNameById, myHubs, retryKey]);

  const visiblePeeks = useMemo(
    () => (peeks ?? []).slice(0, LAUNCHER_PEEK_DISPLAY_LIMIT),
    [peeks]
  );

  const creatorIds = useMemo(
    () => visiblePeeks.map((peek) => peek.creatorId),
    [visiblePeeks]
  );
  const creatorProfiles = usePostAuthorProfiles(creatorIds);
  const discoverHubsHref = appDiscoverTabHref('hubs');
  const overflowLabel = launcherPeekOverflowLabel(
    peeks?.length ?? 0,
    'discover',
    LAUNCHER_PEEK_DISPLAY_LIMIT
  );

  if (!accountId) {
    return null;
  }

  if (error) {
    return (
      <LauncherHomeError
        message={error}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  if (myHubs == null || pending) {
    return <LauncherSocialPeekSkeleton count={5} />;
  }

  if (hubIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <LauncherHomeEmpty>Nothing new right now.</LauncherHomeEmpty>;
  }

  return (
    <LauncherSocialPeekList
      aria-label="Latest drops from your hubs"
      footer={
        overflowLabel ? (
          <p className="launcher-home-more">
            <Link
              href={discoverHubsHref}
              className="launcher-home-inline-link"
              scroll={false}
            >
              {overflowLabel}
            </Link>
          </p>
        ) : null
      }
    >
      {visiblePeeks.map((peek, index) => {
        const profile = creatorProfiles[peek.creatorId];
        const timeLabel =
          peek.createdAtMs > 0
            ? formatMarketRelativeTime(peek.createdAtMs)
            : null;

        return (
          <LauncherSocialPeekRow
            key={peek.key}
            href={peek.href}
            accountId={peek.creatorId}
            profileName={profile?.displayName}
            avatarUrl={profile?.avatarUrl}
            contextLabel={peek.hubName}
            timeLabel={timeLabel}
            excerpt={peek.title}
            showDivider={index > 0}
          />
        );
      })}
    </LauncherSocialPeekList>
  );
}
