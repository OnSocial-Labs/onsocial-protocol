'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DiscoverLoadingScreen } from '@/features/discover/discover-loading-screen';
import {
  DISCOVER_TAB_QUERY_KEY,
  parseDiscoverTab,
} from '@/features/discover/discover-tabs';

function DiscoverLoadingFromSearch() {
  const tab = parseDiscoverTab(
    useSearchParams().get(DISCOVER_TAB_QUERY_KEY)
  );
  return <DiscoverLoadingScreen tab={tab} />;
}

/**
 * Never blank while search params resolve — Market-style full chrome skeleton
 * first, then refine the tab once params are ready.
 */
export default function DiscoverLoading() {
  return (
    <Suspense fallback={<DiscoverLoadingScreen tab="trending" />}>
      <DiscoverLoadingFromSearch />
    </Suspense>
  );
}
