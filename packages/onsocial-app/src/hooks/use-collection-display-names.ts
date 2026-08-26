'use client';

import { useEffect, useState } from 'react';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const nameCache = new Map<string, string>();
const batchInFlight = new Map<string, Promise<Record<string, string>>>();

export function collectionDisplayName(
  title: string | null | undefined,
  collectionId: string
): string {
  return title?.trim() || collectionId.trim();
}

function readCachedNames(collectionIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const collectionId of collectionIds) {
    const cached = nameCache.get(collectionId);
    if (cached !== undefined) out[collectionId] = cached;
  }
  return out;
}

async function fetchCollectionDisplayNamesBatch(
  collectionIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(collectionIds.filter(Boolean))).sort();
  if (uniqueIds.length === 0) return {};

  const fromCache = readCachedNames(uniqueIds);
  const missing = uniqueIds.filter((id) => !nameCache.has(id));
  if (missing.length === 0) return fromCache;

  const batchKey = missing.join('\n');
  const existing = batchInFlight.get(batchKey);
  if (existing) {
    const fetched = await existing;
    return { ...fromCache, ...fetched };
  }

  const request = (async (): Promise<Record<string, string>> => {
    const next: Record<string, string> = {};
    try {
      const client = createReadOnlyOnSocialClient();
      const rows = await client.query.scarces.collectionsCurrentByIds(missing);
      const byId = new Map(
        rows.map((row) => [row.collectionId.trim(), row] as const)
      );
      for (const id of missing) {
        const label = collectionDisplayName(byId.get(id)?.title, id);
        nameCache.set(id, label);
        next[id] = label;
      }
    } catch {
      for (const id of missing) {
        nameCache.set(id, id);
        next[id] = id;
      }
    }
    return next;
  })().finally(() => {
    batchInFlight.delete(batchKey);
  });

  batchInFlight.set(batchKey, request);
  const fetched = await request;
  return { ...fromCache, ...fetched };
}

/** Drop title keyed by collectionId for Activity place labels. */
export function useCollectionDisplayNames(
  collectionIds: string[]
): Record<string, string> {
  const collectionIdsKey = Array.from(new Set(collectionIds.filter(Boolean)))
    .sort()
    .join('\n');
  const ids = collectionIdsKey ? collectionIdsKey.split('\n') : [];
  const fromCache = readCachedNames(ids);
  const [fetched, setFetched] = useState<Record<string, string>>({});
  const [fetchedKey, setFetchedKey] = useState('');

  useEffect(() => {
    if (!collectionIdsKey) return;

    let cancelled = false;

    void fetchCollectionDisplayNamesBatch(ids).then((next) => {
      if (cancelled) return;
      setFetched(next);
      setFetchedKey(collectionIdsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [collectionIdsKey]);

  const activeFetched = fetchedKey === collectionIdsKey ? fetched : {};
  return { ...fromCache, ...activeFetched };
}
