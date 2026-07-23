'use client';

import { DiscoverOmniSearchField } from '@/features/discover/discover-omni-search-field';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';

export function DiscoverNavSearch({ className }: { className?: string }) {
  return <DiscoverOmniSearchField className={className} />;
}

/**
 * Discover tab rail — same scroll tuck as Market filters (hide down, show up).
 * Uses Discover's scroll root ref so page + overlay both tuck after body mounts.
 */
export function DiscoverHeaderTabs() {
  const { tab, setTab, scrollRootRef } = useDiscoverPanel();
  const toolbarHidden = useDockAutoHide(false, scrollRootRef ?? null);

  return (
    <div
      className={`os-app-chrome-rail discover-header-toolbar${
        toolbarHidden ? ' is-scroll-hidden' : ''
      }`}
    >
      <DiscoverTabBar
        tab={tab}
        onTabChange={setTab}
        className="discover-tab-bar--header"
      />
    </div>
  );
}
