'use client';

import { useRef, type RefObject } from 'react';
import { ContextualBack } from '@/components/app/contextual-back';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import {
  DiscoverHeaderTabs,
  DiscoverNavSearch,
} from '@/features/discover/discover-screen-chrome';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';

function DiscoverPageScreen({
  scrollRootRef,
  backFallbackHref,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
  backFallbackHref?: string;
}) {
  return (
    <OsAppScreen
      title="Discover"
      leading={
        backFallbackHref ? (
          <ContextualBack fallbackHref={backFallbackHref} />
        ) : null
      }
      glassChrome
      scrollRootRef={scrollRootRef}
      heading={
        <DiscoverNavSearch className="discover-nav-search-field os-app-screen-search" />
      }
      toolbar={<DiscoverHeaderTabs />}
    >
      <DiscoverPanelContent />
    </OsAppScreen>
  );
}

export function DiscoverPagePanel({
  backFallbackHref,
  initialPage = null,
  initialTrending = null,
  initialGuilds = null,
}: {
  /**
   * When set (portfolio `/@account/discover`), show back before search —
   * e.g. Standing → Discover. App `/discover` omits this (launcher root).
   */
  backFallbackHref?: string;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  initialGuilds?: GuildSummaryCardModel[] | null;
}) {
  const scrollRootRef = useRef<HTMLElement>(null);

  return (
    <DiscoverPanelRoot
      shellVariant="page"
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
      initialTrending={initialTrending}
      initialGuilds={initialGuilds}
    >
      <DiscoverPageScreen
        scrollRootRef={scrollRootRef}
        backFallbackHref={backFallbackHref}
      />
    </DiscoverPanelRoot>
  );
}
