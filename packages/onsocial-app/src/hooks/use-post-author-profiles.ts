'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ProfileKind, ProfileSearchRow } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

export interface PostAuthorProfile {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  kind?: ProfileKind | null;
}

const profileCache = new Map<string, PostAuthorProfile | null>();
const batchInFlight = new Map<
  string,
  Promise<Record<string, PostAuthorProfile>>
>();
const EMPTY_PROFILE_RECORD: Record<string, PostAuthorProfile> = {};
/*
 * Bumped on every cache write. `usePostAuthorProfiles` subscribes to it as
 * an external store, so any render still picks up fresh seeds immediately
 * while an unchanged cache returns the same record identity — that identity
 * is what lets memoized feed cards skip re-rendering.
 */
let profileCacheVersion = 0;
const profileCacheListeners = new Set<() => void>();

function notifyProfileCacheListeners(): void {
  for (const listener of profileCacheListeners) listener();
}

/**
 * Store subscription for `usePostAuthorProfiles`. Seed writes only notify
 * when the caller passes `{ notify: true }` — render-phase callers must not
 * (emitting would setState in subscribed cards during another component's
 * render; their snapshot reads already pick up the write in the same pass).
 */
export function subscribePostAuthorProfiles(
  listener: () => void
): () => void {
  profileCacheListeners.add(listener);
  return () => {
    profileCacheListeners.delete(listener);
  };
}

function toPostAuthorProfile(
  accountId: string,
  name?: string | null,
  avatar?: string | null,
  kind?: ProfileKind | null
): PostAuthorProfile | null {
  const displayName = name?.trim() ?? '';
  const avatarUrl = resolveProfileMediaUrl(avatar);
  if (!displayName && !avatarUrl && !kind) return null;
  return { accountId, displayName, avatarUrl, kind: kind ?? null };
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

/** True once each id has been fetched (profile or confirmed miss). */
export function arePostAuthorProfilesResolved(accountIds: string[]): boolean {
  if (accountIds.length === 0) return true;
  return accountIds.every((accountId) => profileCache.has(accountId));
}

/**
 * Profiles for this render.
 *
 * Generation 0 is the server and hydration snapshot. The cache lives in the
 * JS realm that rendered the page, so a warm server process must not paint a
 * name or avatar the browser does not have yet. An empty client cache is
 * also generation 0, and skipping the read is the same as an empty map.
 */
export function selectPostAuthorProfiles(
  accountIds: string[],
  cacheGeneration: number,
  fetched: Record<string, PostAuthorProfile> = EMPTY_PROFILE_RECORD
): Record<string, PostAuthorProfile> {
  if (accountIds.length === 0) return EMPTY_PROFILE_RECORD;
  if (cacheGeneration === 0) return fetched;
  return mergeProfileRecords(readCachedProfiles(accountIds), fetched);
}

function mergeProfileRecords(
  base: Record<string, PostAuthorProfile>,
  overlay: Record<string, PostAuthorProfile>
): Record<string, PostAuthorProfile> {
  const out: Record<string, PostAuthorProfile> = { ...base };
  for (const [accountId, profile] of Object.entries(overlay)) {
    const previous = out[accountId];
    out[accountId] = {
      accountId,
      displayName: profile.displayName || previous?.displayName || '',
      avatarUrl: profile.avatarUrl || previous?.avatarUrl || null,
      kind: profile.kind ?? previous?.kind ?? null,
    };
  }
  return out;
}

export function seedPostAuthorProfile(
  profile: PostAuthorProfile,
  options?: { notify?: boolean }
): void {
  const displayName = profile.displayName.trim();
  const avatarUrl = profile.avatarUrl ?? null;
  if (!displayName && !avatarUrl && !profile.kind) return;
  const existing = profileCache.get(profile.accountId);
  // Never downgrade — Hot re-sort / reconcile can reseed name-only rows
  // and would wipe avatars that already loaded.
  const merged: PostAuthorProfile = {
    accountId: profile.accountId,
    displayName: displayName || existing?.displayName || '',
    avatarUrl: avatarUrl || existing?.avatarUrl || null,
    kind: profile.kind ?? existing?.kind ?? null,
  };
  // Keep the cached object when nothing changed so dependent props keep
  // their identity and subscribers are not woken for a no-op reseed.
  if (
    existing &&
    existing.displayName === merged.displayName &&
    existing.avatarUrl === merged.avatarUrl &&
    existing.kind === merged.kind
  ) {
    return;
  }
  profileCache.set(profile.accountId, merged);
  profileCacheVersion += 1;
  if (options?.notify) notifyProfileCacheListeners();
}

export function peekPostAuthorKind(
  accountId: string
): ProfileKind | null | undefined {
  return profileCache.get(accountId)?.kind;
}

export function seedPostAuthorProfiles(
  profiles: PostAuthorProfile[],
  options?: { notify?: boolean }
): void {
  for (const profile of profiles) {
    seedPostAuthorProfile(profile, options);
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
  posts: FeedAuthorSeed[],
  options?: { notify?: boolean }
): void {
  for (const post of posts) {
    const main = toPostAuthorProfile(
      post.accountId,
      post.authorName,
      post.authorAvatar
    );
    if (main) seedPostAuthorProfile(main, options);

    if (post.refAuthor) {
      const quoted = toPostAuthorProfile(
        post.refAuthor,
        post.refAuthorName,
        post.refAuthorAvatar
      );
      if (quoted) seedPostAuthorProfile(quoted, options);
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
    let rows: ProfileSearchRow[];
    try {
      rows = await client.query.profiles.statsForAccounts(missing);
    } catch {
      // Older Graph deployments may not expose profileSearch yet. The raw
      // profilesCurrent view still provides enough data for post bylines.
      let profiles: Record<string, { name?: string; avatar?: string }> = {};
      try {
        profiles = await client.profiles.getMany(missing);
      } catch {
        // Keep the feed usable even when both Graph profile views are stale.
      }
      const next: Record<string, PostAuthorProfile> = {};
      for (const accountId of missing) {
        const profile = profiles[accountId];
        const author = profile
          ? toPostAuthorProfile(accountId, profile.name, profile.avatar)
          : null;
        if (author) {
          seedPostAuthorProfile(author);
          next[accountId] = author;
        } else if (!profileCache.has(accountId)) {
          profileCache.set(accountId, null);
          profileCacheVersion += 1;
        }
      }
      return next;
    }
    const byId = new Map(rows.map((row) => [row.accountId, row] as const));
    const next: Record<string, PostAuthorProfile> = {};

    for (const accountId of missing) {
      const row = byId.get(accountId);
      const profile = row
        ? toPostAuthorProfile(accountId, row.name, row.avatar, row.kind)
        : null;
      if (profile) {
        seedPostAuthorProfile(profile);
        const merged = profileCache.get(accountId);
        if (merged) next[accountId] = merged;
      } else if (!profileCache.has(accountId)) {
        profileCache.set(accountId, null);
        profileCacheVersion += 1;
      }
    }

    return next;
  })().finally(() => {
    batchInFlight.delete(batchKey);
  });

  batchInFlight.set(batchKey, request);
  const fetched = await request;
  return mergeProfileRecords(fromCache, fetched);
}

/** Warm the author cache before a reader opens. Joins the feed's batch. */
export function prefetchPostAuthorProfiles(
  accountIds: string[]
): Promise<void> {
  const missing = accountIds.filter((id) => id && !profileCache.has(id));
  if (missing.length === 0) return Promise.resolve();
  const version = profileCacheVersion;
  return fetchPostAuthorProfilesBatch(accountIds).then(() => {
    if (profileCacheVersion !== version) notifyProfileCacheListeners();
  });
}

export function usePostAuthorProfiles(
  accountIds: string[]
): Record<string, PostAuthorProfile> {
  const accountIdsKey = Array.from(new Set(accountIds.filter(Boolean)))
    .sort()
    .join('\n');
  const [fetched, setFetched] =
    useState<Record<string, PostAuthorProfile>>(EMPTY_PROFILE_RECORD);
  const [fetchedKey, setFetchedKey] = useState('');

  useEffect(() => {
    if (!accountIdsKey) return;

    let cancelled = false;

    void fetchPostAuthorProfilesBatch(accountIdsKey.split('\n')).then(
      (next) => {
        if (cancelled) return;
        setFetched(next);
        setFetchedKey(accountIdsKey);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [accountIdsKey]);

  /*
   * Client snapshot is the cache generation, so a same-render seed is visible
   * immediately and an effect seed re-renders subscribed cards. The server
   * snapshot stays 0: that generation is not in the HTML. See
   * selectPostAuthorProfiles.
   */
  const version = useSyncExternalStore(
    subscribePostAuthorProfiles,
    () => profileCacheVersion,
    () => 0
  );
  return useMemo(() => {
    const ids = accountIdsKey ? accountIdsKey.split('\n') : [];
    const activeFetched =
      fetchedKey === accountIdsKey ? fetched : EMPTY_PROFILE_RECORD;
    return selectPostAuthorProfiles(ids, version, activeFetched);
  }, [accountIdsKey, version, fetched, fetchedKey]);
}
