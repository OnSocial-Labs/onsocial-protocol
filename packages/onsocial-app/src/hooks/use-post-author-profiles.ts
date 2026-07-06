import { useEffect, useMemo, useState } from 'react';

export interface PostAuthorProfile {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}

const profileCache = new Map<string, PostAuthorProfile | null>();
const profileInFlight = new Map<string, Promise<PostAuthorProfile | null>>();

async function fetchPostAuthorProfile(
  accountId: string
): Promise<PostAuthorProfile | null> {
  const cached = profileCache.get(accountId);
  if (cached !== undefined) {
    return cached;
  }

  const existing = profileInFlight.get(accountId);
  if (existing) {
    return existing;
  }

  const request = fetch(
    `/api/profile/shell?${new URLSearchParams({ accountId }).toString()}`
  )
    .then(async (response) => {
      if (!response.ok) return null;
      return (await response
        .json()
        .catch(() => null)) as PostAuthorProfile | null;
    })
    .then((profile) => {
      const resolved =
        profile && profile.accountId === accountId
          ? {
              accountId,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl ?? null,
            }
          : null;
      profileCache.set(accountId, resolved);
      return resolved;
    })
    .catch(() => {
      profileCache.set(accountId, null);
      return null;
    })
    .finally(() => {
      profileInFlight.delete(accountId);
    });

  profileInFlight.set(accountId, request);
  return request;
}

export function usePostAuthorProfiles(accountIds: string[]) {
  const uniqueAccountIds = useMemo(
    () => Array.from(new Set(accountIds.filter(Boolean))).sort(),
    [accountIds]
  );
  const cacheKey = uniqueAccountIds.join('\n');
  const [profiles, setProfiles] = useState<Record<string, PostAuthorProfile>>(
    {}
  );

  useEffect(() => {
    if (uniqueAccountIds.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      uniqueAccountIds.map(
        async (accountId): Promise<[string, PostAuthorProfile | null]> => [
          accountId,
          await fetchPostAuthorProfile(accountId),
        ]
      )
    ).then((entries) => {
      if (cancelled) return;

      const nextProfiles: Record<string, PostAuthorProfile> = {};
      for (const [accountId, profile] of entries) {
        if (profile) {
          nextProfiles[accountId] = profile;
        }
      }
      setProfiles(nextProfiles);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, uniqueAccountIds]);

  return profiles;
}
