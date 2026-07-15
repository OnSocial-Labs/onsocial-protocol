'use client';

import { useEffect, useState } from 'react';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

export interface PostAuthorProfile {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}

const profileCache = new Map<string, PostAuthorProfile | null>();
const batchInFlight = new Map<string, Promise<Record<string, PostAuthorProfile>>>();

function toPostAuthorProfile(
  accountId: string,
  name?: string | null,
  avatar?: string | null
): PostAuthorProfile | null {
  const displayName = name?.trim() ?? '';
  const avatarUrl = resolveProfileMediaUrl(avatar);
  if (!displayName && !avatarUrl) return null;
  return { accountId, displayName, avatarUrl };
}

function readCachedProfiles(
  accountIds: string[]
): Record<string, PostAuthorProfile> {
  const out: Record<string, PostAuthorProfile> = {};
  for (const accountId of accountIds) {
    const cached = profileCache.get(accountId);
    if (cached) out[accountId] = cached;
  }
  return out;
}

export function seedPostAuthorProfile(profile: PostAuthorProfile): void {
  const displayName = profile.displayName.trim();
  const avatarUrl = profile.avatarUrl ?? null;
  if (!displayName && !avatarUrl) return;
  profileCache.set(profile.accountId, {
    accountId: profile.accountId,
    displayName,
    avatarUrl,
  });
}

export function seedPostAuthorProfiles(profiles: PostAuthorProfile[]): void {
  for (const profile of profiles) {
    seedPostAuthorProfile(profile);
  }
}

type FeedAuthorSeed = {
  accountId: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  refAuthor?: string | null;
  refAuthorName?: string | null;
  refAuthorAvatar?: string | null;
};

export function seedPostAuthorProfilesFromFeed(
  posts: FeedAuthorSeed[]
): void {
  for (const post of posts) {
    const main = toPostAuthorProfile(
      post.accountId,
      post.authorName,
      post.authorAvatar
    );
    if (main) seedPostAuthorProfile(main);

    if (post.refAuthor) {
      const quoted = toPostAuthorProfile(
        post.refAuthor,
        post.refAuthorName,
        post.refAuthorAvatar
      );
      if (quoted) seedPostAuthorProfile(quoted);
    }
  }
}

async function fetchPostAuthorProfilesBatch(
  accountIds: string[]
): Promise<Record<string, PostAuthorProfile>> {
  const uniqueIds = Array.from(new Set(accountIds.filter(Boolean))).sort();
  if (uniqueIds.length === 0) return {};

  const fromCache = readCachedProfiles(uniqueIds);
  const missing = uniqueIds.filter((id) => !profileCache.has(id));
  if (missing.length === 0) return fromCache;

  const batchKey = missing.join('\n');
  const existing = batchInFlight.get(batchKey);
  if (existing) {
    const fetched = await existing;
    return { ...fromCache, ...fetched };
  }

  const request = (async (): Promise<Record<string, PostAuthorProfile>> => {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.profiles.statsForAccounts(missing);
    const byId = new Map(rows.map((row) => [row.accountId, row] as const));
    const next: Record<string, PostAuthorProfile> = {};

    for (const accountId of missing) {
      const row = byId.get(accountId);
      const profile = row
        ? toPostAuthorProfile(accountId, row.name, row.avatar)
        : null;
      profileCache.set(accountId, profile);
      if (profile) next[accountId] = profile;
    }

    return next;
  })().finally(() => {
    batchInFlight.delete(batchKey);
  });

  batchInFlight.set(batchKey, request);
  const fetched = await request;
  return { ...fromCache, ...fetched };
}

export function usePostAuthorProfiles(
  accountIds: string[]
): Record<string, PostAuthorProfile> {
  const accountIdsKey = Array.from(new Set(accountIds.filter(Boolean)))
    .sort()
    .join('\n');
  const uniqueAccountIds = accountIdsKey ? accountIdsKey.split('\n') : [];
  // Re-read module cache each render so feed seeding paints names immediately.
  const fromCache = readCachedProfiles(uniqueAccountIds);
  const [fetched, setFetched] = useState<Record<string, PostAuthorProfile>>({});
  const [fetchedKey, setFetchedKey] = useState('');

  useEffect(() => {
    if (!accountIdsKey) return;

    let cancelled = false;

    void fetchPostAuthorProfilesBatch(uniqueAccountIds).then((next) => {
      if (cancelled) return;
      setFetched(next);
      setFetchedKey(accountIdsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [accountIdsKey]);

  if (!accountIdsKey) {
    return {};
  }

  const activeFetched = fetchedKey === accountIdsKey ? fetched : {};
  return { ...fromCache, ...activeFetched };
}
