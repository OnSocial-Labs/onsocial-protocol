'use client';

import { useEffect, useState } from 'react';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const nameCache = new Map<string, string>();
const batchInFlight = new Map<string, Promise<Record<string, string>>>();

function readCachedNames(groupIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const groupId of groupIds) {
    const cached = nameCache.get(groupId);
    if (cached !== undefined) out[groupId] = cached;
  }
  return out;
}

export function seedGuildDisplayNames(entries: Record<string, string>): void {
  for (const [groupId, name] of Object.entries(entries)) {
    if (!groupId) continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    nameCache.set(groupId, guildDisplayName(trimmed, groupId));
  }
}

export function seedGuildDisplayNamesFromFeed(
  posts: Array<{ groupId?: string; groupName?: string | null }>
): void {
  const entries: Record<string, string> = {};
  for (const post of posts) {
    const groupId = post.groupId?.trim();
    const groupName = post.groupName?.trim();
    if (!groupId || !groupName) continue;
    entries[groupId] = groupName;
  }
  seedGuildDisplayNames(entries);
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
  // Re-read module cache each render so feed seeding paints labels immediately.
  const fromCache = readCachedNames(ids);
  const [fetched, setFetched] = useState<Record<string, string>>({});
  const [fetchedKey, setFetchedKey] = useState('');

  useEffect(() => {
    if (!groupIdsKey) return;

    let cancelled = false;

    void fetchGuildDisplayNamesBatch(ids).then((next) => {
      if (cancelled) return;
      setFetched(next);
      setFetchedKey(groupIdsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [groupIdsKey]);

  const activeFetched = fetchedKey === groupIdsKey ? fetched : {};
  return { ...fromCache, ...activeFetched };
}
