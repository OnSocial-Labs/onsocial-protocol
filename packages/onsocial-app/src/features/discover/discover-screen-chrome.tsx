'use client';

import { DiscoverOmniSearchField } from '@/features/discover/discover-omni-search-field';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';
import Link from 'next/link';
import { OsAppChromeToolbarRail } from '@onsocial/ui';
import { APP_EVENTS_PATH } from '@/lib/app-routes';

export function DiscoverNavSearch({ className }: { className?: string }) {
  return <DiscoverOmniSearchField className={className} />;
}

/** Discover tab rail — scroll tuck hides search above (OsAppScreen scrollTuck="search"). */
export function DiscoverHeaderTabs() {
  const { tab, setTab } = useDiscoverPanel();

  return (
    <OsAppChromeToolbarRail className="discover-header-toolbar">
      <DiscoverTabBar
        tab={tab}
        onTabChange={setTab}
        className="discover-tab-bar--header"
      />
      <Link href={APP_EVENTS_PATH} scroll={false} className="os-surface-chip">
        Events
      </Link>
    </OsAppChromeToolbarRail>
  );
}
