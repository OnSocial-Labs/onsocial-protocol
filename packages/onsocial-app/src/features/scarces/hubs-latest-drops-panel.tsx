'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { AppView } from '@/features/scarces/apps-data';
import { collectionCurrentRowToView } from '@/features/scarces/collections-data';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { collectionPath } from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const HUB_DROP_LIMIT = 24;
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
          limit: PEEK_LIMIT,
        });
        if (cancelled) return;
        const mapped = rows
          .map((row) => {
            const view = collectionCurrentRowToView(row);
            if (!view) return null;
            const appId = view.appId?.trim() || '';
            return {
              key: `${appId}:${view.collectionId}`,
              appId,
              hubName: hubNameById.get(appId) ?? (appId || 'Hub'),
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
  }, [accountId, hubIds, hubNameById, myHubs]);

  if (!accountId) {
    return null;
  }

  if (error) {
    return <p className="launcher-home-empty">{error}</p>;
  }

  if (myHubs == null || pending) {
    return <p className="launcher-home-empty">Loading drops…</p>;
  }

  if (hubIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <p className="launcher-home-empty">Nothing new right now.</p>;
  }

  return (
    <ul className="launcher-peek-list" aria-label="Drops from your hubs">
      {peeks.map((peek) => (
        <li key={peek.key}>
          <Link href={peek.href} className="launcher-peek-row" scroll={false}>
            <span className="launcher-peek-row-copy">
              <span className="launcher-peek-row-title">{peek.title}</span>
              <span className="launcher-peek-row-meta">
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
