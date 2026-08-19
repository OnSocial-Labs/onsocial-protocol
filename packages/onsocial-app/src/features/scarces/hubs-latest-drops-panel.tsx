'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AppView } from '@/features/scarces/apps-data';
import { fetchCollectionsByApp } from '@/features/scarces/collections-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { collectionPath } from '@/lib/app-routes';

const HUB_DROP_LIMIT = 12;
const PEEK_PER_HUB = 3;
const PEEK_LIMIT = 24;

export type HubDropPeek = {
  key: string;
  appId: string;
  hubName: string;
  collectionId: string;
  title: string;
  createdAtMs: number;
  href: string;
};

/**
 * Membership-scoped drop peeks under Hubs Home.
 * Network catalog stays in Discover; this is activity across *your* hubs.
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
      });
      return;
    }
    if (myHubs == null) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(true);
      });
      return;
    }
    if (hubIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        setPending(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPending(true);
    });

    void (async () => {
      const settled = await Promise.allSettled(
        hubIds.map(async (appId) => {
          const drops = await fetchCollectionsByApp(appId, {
            limit: PEEK_PER_HUB,
          });
          const hubName = hubNameById.get(appId) ?? appId;
          return drops.map((drop) => ({
            key: `${appId}:${drop.collectionId}`,
            appId,
            hubName,
            collectionId: drop.collectionId,
            title: (drop.title || drop.collectionId).trim().slice(0, 120),
            createdAtMs: drop.createdAtMs || 0,
            href: collectionPath(drop.collectionId),
          })) satisfies HubDropPeek[];
        })
      );

      if (cancelled) return;

      const merged: HubDropPeek[] = [];
      for (const result of settled) {
        if (result.status === 'fulfilled') merged.push(...result.value);
      }
      merged.sort((a, b) => b.createdAtMs - a.createdAtMs);
      setPeeks(merged.slice(0, PEEK_LIMIT));
      setPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, hubIds, hubNameById, myHubs]);

  if (!accountId) {
    return null;
  }

  if (myHubs == null || pending) {
    return <p className="daos-index-empty">Loading drops…</p>;
  }

  if (hubIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <p className="daos-index-empty">Nothing new right now.</p>;
  }

  return (
    <ul className="daos-explore-list" aria-label="Drops from your hubs">
      {peeks.map((peek) => (
        <li key={peek.key}>
          <Link
            href={peek.href}
            className="daos-explore-row"
            scroll={false}
          >
            <span className="daos-explore-row-copy">
              <span className="daos-explore-row-title">{peek.title}</span>
              <span className="daos-explore-row-meta">
                {peek.hubName}
                {peek.createdAtMs > 0 ? (
                  <>
                    <span aria-hidden> · </span>
                    {formatMarketRelativeTime(peek.createdAtMs)}
                  </>
                ) : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
