'use client';

import { useRef } from 'react';
import { PageDrawerCollectionList } from '@/components/portfolio/page-drawer-collection';
import { PageDrawerScarcesPanel } from '@/components/portfolio/page-drawer-scarces';
import {
  isProfileFeedTab,
  type PortfolioRailTab,
} from '@/components/portfolio/profile-feed-tabs';
import {
  ProfileFeedClient,
  type ProfileFeedTab,
} from '@/features/home/profile-feed-client';
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

function defaultFeedTab(tab: PortfolioRailTab): ProfileFeedTab {
  return isProfileFeedTab(tab) ? tab : 'posts';
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
  const feedActive = isProfileFeedTab(tab);
  // Keep feed mounted after first visit — refs avoid setState-in-effect.
  const feedVisitedRef = useRef(feedActive);
  const keptFeedTabRef = useRef<ProfileFeedTab>(defaultFeedTab(tab));
  if (feedActive) {
    feedVisitedRef.current = true;
    keptFeedTabRef.current = tab;
  }
  const feedVisited = feedVisitedRef.current;
  const keptFeedTab = keptFeedTabRef.current;

  return (
    <div className="page-drawer-sections">
      {feedVisited ? (
        <div hidden={!feedActive}>
          <ProfileFeedClient
            accountId={pageAccountId}
            postCount={postCount}
            tab={feedActive ? tab : keptFeedTab}
          />
        </div>
      ) : null}
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
