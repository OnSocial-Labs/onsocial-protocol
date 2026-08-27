'use client';

import { useEffect, useState } from 'react';
import {
  fetchCommunityAppCatalog,
  type CommunityAppListing,
} from '@/lib/community-app-catalog';

export function useCommunityAppCatalog(enabled: boolean) {
  const [apps, setApps] = useState<CommunityAppListing[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchCommunityAppCatalog().then((next) => {
      if (!cancelled) setApps(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return apps;
}
