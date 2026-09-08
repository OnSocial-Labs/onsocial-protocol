'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  osLastPlaceIsReturnable,
  patchOsLastPlaceFace,
  readOsLastPlace,
  rememberOsLastPlaceFromPath,
  resolveOsLastPlaceSpokenLabel,
  subscribeOsLastPlace,
  type OsLastPlace,
} from '@/lib/os-launcher-last-place';

export type OsLastPlaceView = OsLastPlace & {
  spokenLabel: string;
};

/**
 * Remember the last portfolio page so the launcher can reopen it after a
 * Home hop. Own page is omitted — the Page tile already does that.
 */
export function useOsLauncherLastPlace(
  pathname: string,
  viewerAccountId?: string | null
): OsLastPlaceView | null {
  useEffect(() => {
    rememberOsLastPlaceFromPath(pathname);
  }, [pathname]);

  const stored = useSyncExternalStore(
    subscribeOsLastPlace,
    readOsLastPlace,
    () => null
  );

  const place = osLastPlaceIsReturnable(stored, pathname, viewerAccountId)
    ? stored
    : null;
  const lastPlaceAccountId = place?.accountId ?? null;

  useEffect(() => {
    if (!lastPlaceAccountId) return;
    const accountId = lastPlaceAccountId;
    const controller = new AbortController();
    void fetch(
      `/api/profile/shell?accountId=${encodeURIComponent(accountId)}`,
      { signal: controller.signal }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          body: {
            displayName?: string | null;
            avatarUrl?: string | null;
          } | null
        ) => {
          if (!body) return;
          patchOsLastPlaceFace(accountId, {
            profileName: body.displayName ?? null,
            avatarUrl: body.avatarUrl ?? null,
          });
        }
      )
      .catch(() => {
        // ignore abort / network — spoken local part still works
      });
    return () => {
      controller.abort();
    };
  }, [lastPlaceAccountId]);

  if (!place) return null;

  return {
    ...place,
    spokenLabel: resolveOsLastPlaceSpokenLabel(
      place.accountId,
      place.profileName
    ),
  };
}
