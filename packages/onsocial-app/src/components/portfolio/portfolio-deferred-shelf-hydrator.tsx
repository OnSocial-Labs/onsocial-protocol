'use client';

import { useEffect } from 'react';
import { usePortfolioDrawerDataHydrate } from '@/contexts/portfolio-drawer-data-context';
import { usePortfolioShelfHydrate } from '@/contexts/portfolio-shelf-context';
import { usePortfolioPostPeeksHydrate } from '@/contexts/portfolio-post-peeks-context';
import type {
  ProfileCreatedPeek,
  ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';
import type { ProfileStoreShelf } from '@/lib/profile-store-types';

/** Pushes streamed SSR peeks + drawer meta into portfolio drawer contexts. */
export function PortfolioDeferredShelfHydrator({
  postPeeks,
  createdPeeks,
  storeShelf,
  holdings,
  guilds,
  drawerMeta,
}: {
  postPeeks: ProfilePostPeek[];
  createdPeeks: ProfileCreatedPeek[];
  storeShelf: ProfileStoreShelf;
  holdings: PortfolioHoldingPeek[];
  guilds: ProfileGuildSummary[];
  drawerMeta: PageDrawerMeta;
}) {
  const hydratePosts = usePortfolioPostPeeksHydrate();
  const hydrateShelf = usePortfolioShelfHydrate();
  const hydrateDrawerData = usePortfolioDrawerDataHydrate();

  useEffect(() => {
    hydratePosts(postPeeks);
    hydrateShelf({ createdPeeks, storeShelf, holdings });
    hydrateDrawerData({ drawerMeta, guilds });
  }, [
    createdPeeks,
    drawerMeta,
    guilds,
    holdings,
    hydrateDrawerData,
    hydratePosts,
    hydrateShelf,
    postPeeks,
    storeShelf,
  ]);

  return null;
}
