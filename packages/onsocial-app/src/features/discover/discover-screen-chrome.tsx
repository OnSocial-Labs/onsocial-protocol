'use client';

import { DiscoverOmniSearchField } from '@/features/discover/discover-omni-search-field';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';

export function DiscoverNavSearch({ className }: { className?: string }) {
  return <DiscoverOmniSearchField className={className} />;
}

export function DiscoverHeaderTabs() {
  const { tab, setTab } = useDiscoverPanel();

  return (
    <DiscoverTabBar
      tab={tab}
      onTabChange={setTab}
      className="discover-tab-bar--header"
    />
  );
}
