'use client';

import { useEffect } from 'react';
import { usePortfolioShelfHydrate } from '@/contexts/portfolio-shelf-context';
import { usePortfolioPostPeeksHydrate } from '@/contexts/portfolio-post-peeks-context';
import type {
  ProfileCreatedPeek,
  ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';
import type { ProfileStoreShelf } from '@/lib/profile-store-types';

/** Pushes streamed SSR peeks into portfolio drawer contexts. */
export function PortfolioDeferredShelfHydrator({
  postPeeks,
  createdPeeks,
  storeShelf,
}: {
  postPeeks: ProfilePostPeek[];
  createdPeeks: ProfileCreatedPeek[];
  storeShelf: ProfileStoreShelf;
}) {
  const hydratePosts = usePortfolioPostPeeksHydrate();
  const hydrateShelf = usePortfolioShelfHydrate();

  useEffect(() => {
    hydratePosts(postPeeks);
    hydrateShelf({ createdPeeks, storeShelf });
  }, [createdPeeks, hydratePosts, hydrateShelf, postPeeks, storeShelf]);

  return null;
}
