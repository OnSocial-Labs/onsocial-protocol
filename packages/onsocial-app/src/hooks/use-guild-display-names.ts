'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const nameCache = new Map<string, string>();
const batchInFlight = new Map<string, Promise<Record<string, string>>>();
/*
 * Same external-store contract as the author-profile cache: the version is
 * the useSyncExternalStore snapshot, and seed writes only notify when the
 * caller passes `{ notify: true }` (effects / async hydrate — never render).
 */
let nameCacheVersion = 0;
const nameCacheListeners = new Set<() => void>();

function notifyNameCacheListeners(): void {
  for (const listener of nameCacheListeners) listener();
}

export function subscribeGuildDisplayNames(
  listener: () => void
): () => void {
  nameCacheListeners.add(listener);
  return () => {
    nameCacheListeners.delete(listener);
  };
}

function readCachedNames(groupIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const groupId of groupIds) {
    const cached = nameCache.get(groupId);
    if (cached !== undefined) out[groupId] = cached;
  }
  return out;
}

export function seedGuildDisplayNames(
  entries: Record<string, string>,
  options?: { notify?: boolean }
): void {
  let changed = false;
  for (const [groupId, name] of Object.entries(entries)) {
    if (!groupId) continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    const label = guildDisplayName(trimmed, groupId);
    if (nameCache.get(groupId) === label) continue;
    nameCache.set(groupId, label);
    changed = true;
  }
  if (changed) {
    nameCacheVersion += 1;
    if (options?.notify) notifyNameCacheListeners();
  }
}

export function seedGuildDisplayNamesFromFeed(
  posts: Array<{ groupId?: string; groupName?: string | null }>,
  options?: { notify?: boolean }
): void {
  const entries: Record<string, string> = {};
  for (const post of posts) {
    const groupId = post.groupId?.trim();
    const groupName = post.groupName?.trim();
    if (!groupId || !groupName) continue;
    entries[groupId] = groupName;
  }
  seedGuildDisplayNames(entries, options);
}

async function fetchGuildDisplayNamesBatch(
  groupIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(groupIds.filter(Boolean))).sort();
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
      const rows = await client.query.groups.byIds(missing);
      const byId = new Map(rows.map((row) => [row.groupId, row] as const));
      for (const id of missing) {
        const label = guildDisplayName(byId.get(id)?.groupName, id);
        nameCache.set(id, label);
        next[id] = label;
      }
    } catch {
      for (const id of missing) {
        const label = guildDisplayName(null, id);
        nameCache.set(id, label);
        next[id] = label;
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

/** Display label keyed by groupId for mixed-feed guild chips. */
export function useGuildDisplayNames(
  groupIds: string[]
): Record<string, string> {
  const groupIdsKey = Array.from(new Set(groupIds.filter(Boolean)))
    .sort()
    .join('\n');
  const ids = groupIdsKey ? groupIdsKey.split('\n') : [];
  // Version snapshot: same-render seeds are read in this pass, effect seeds
  // notify and re-render before paint, an untouched cache keeps identity.
  const version = useSyncExternalStore(
    subscribeGuildDisplayNames,
    () => nameCacheVersion,
    () => nameCacheVersion
  );
  const [fetched, setFetched] = useState<Record<string, string>>({});
  const [fetchedKey, setFetchedKey] = useState('');

  useEffect(() => {
    if (!groupIdsKey) return;

    let cancelled = false;

    void fetchGuildDisplayNamesBatch(groupIdsKey.split('\n')).then((next) => {
      if (cancelled) return;
      setFetched(next);
      setFetchedKey(groupIdsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [groupIdsKey]);

  return useMemo(() => {
    const fromCache = readCachedNames(ids);
    const activeFetched = fetchedKey === groupIdsKey ? fetched : {};
    return { ...fromCache, ...activeFetched };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdsKey, version, fetched, fetchedKey]);
}
