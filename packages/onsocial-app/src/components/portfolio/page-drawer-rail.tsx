'use client';

import { PageDrawerCollectionList } from '@/components/portfolio/page-drawer-collection';
import { PageDrawerScarcesPanel } from '@/components/portfolio/page-drawer-scarces';
import {
  isProfileFeedTab,
  type PortfolioRailTab,
} from '@/components/portfolio/profile-feed-tabs';
import { ProfileFeedClient } from '@/features/home/profile-feed-client';
import type { ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import type { ProfileStoreShelf as ProfileStoreShelfData } from '@/lib/profile-store-types';

export interface PageDrawerRailPanelsProps {
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  tab: PortfolioRailTab;
  postCount: number;
  storeShelf: ProfileStoreShelfData;
  createdPeeks: ProfileCreatedPeek[];
  holdings: PortfolioHoldingPeek[];
}

/** Active rail tab content inside the page drawer. */
export function PageDrawerRailPanels({
  pageAccountId,
  profileName,
  avatarUrl,
  tab,
  postCount,
  storeShelf,
  createdPeeks,
  holdings,
}: PageDrawerRailPanelsProps) {
  if (isProfileFeedTab(tab)) {
    return (
      <ProfileFeedClient
        accountId={pageAccountId}
        postCount={postCount}
        tab={tab}
      />
    );
  }

  return (
    <div className="page-drawer-sections">
      {tab === 'scarces' ? (
        <PageDrawerScarcesPanel
          pageAccountId={pageAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
          storeShelf={storeShelf}
          createdPeeks={createdPeeks}
        />
      ) : null}

      {tab === 'collection' ? (
        <PageDrawerCollectionList
          pageAccountId={pageAccountId}
          initialHoldings={holdings}
        />
      ) : null}

      <div className="page-drawer-scroll-end" aria-hidden />
    </div>
  );
}
