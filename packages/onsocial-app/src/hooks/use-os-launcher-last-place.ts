'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  osLastPlaceIsReturnable,
  readOsLastPlace,
  rememberOsLastPlaceFromPath,
  subscribeOsLastPlace,
  type OsLastPlace,
} from '@/lib/os-launcher-last-place';

/**
 * Remember the last portfolio page so the launcher can reopen it after a
 * Home hop. Own page is omitted — the Page tile already does that.
 */
export function useOsLauncherLastPlace(
  pathname: string,
  viewerAccountId?: string | null
): OsLastPlace | null {
  useEffect(() => {
    rememberOsLastPlaceFromPath(pathname);
  }, [pathname]);

  const stored = useSyncExternalStore(
    subscribeOsLastPlace,
    readOsLastPlace,
    () => null
  );

  return osLastPlaceIsReturnable(stored, pathname, viewerAccountId)
    ? stored
    : null;
}
