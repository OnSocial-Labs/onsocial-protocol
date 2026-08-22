'use client';

import { useEffect } from 'react';
import { usePortfolioShelfHydrate } from '@/contexts/portfolio-shelf-context';
import { usePortfolioPostPeeksHydrate } from '@/contexts/portfolio-post-peeks-context';
import type {
  ProfileCreatedPeek,
  ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import type { ProfileStoreShelf } from '@/lib/profile-store-types';

/** Pushes streamed SSR peeks into portfolio drawer contexts. */
export function PortfolioDeferredShelfHydrator({
  postPeeks,
  createdPeeks,
  storeShelf,
  holdings,
}: {
  postPeeks: ProfilePostPeek[];
  createdPeeks: ProfileCreatedPeek[];
  storeShelf: ProfileStoreShelf;
  holdings: PortfolioHoldingPeek[];
}) {
  const hydratePosts = usePortfolioPostPeeksHydrate();
  const hydrateShelf = usePortfolioShelfHydrate();

  useEffect(() => {
    hydratePosts(postPeeks);
    hydrateShelf({ createdPeeks, storeShelf, holdings });
  }, [
    createdPeeks,
    holdings,
    hydratePosts,
    hydrateShelf,
    postPeeks,
    storeShelf,
  ]);

  return null;
}
