'use client';

import { useRef, type RefObject } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import {
  DiscoverHeaderTabs,
  DiscoverNavSearch,
} from '@/features/discover/discover-screen-chrome';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import { useOsRootLeaveHref } from '@/hooks/use-os-root-leave-href';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';

function DiscoverPageScreen({
  scrollRootRef,
  backFallbackHref,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
  /** Nested Discover (portfolio `/@account/discover`) — dock back, not header. */
  backFallbackHref?: string;
}) {
  const arrivalLeaveHref = useOsRootLeaveHref();
  const leaveHref = backFallbackHref ?? arrivalLeaveHref;

  return (
    <OsAppScreen
      title="Discover"
      compactChrome
      glassChrome
      scrollTuck="search"
      scrollRootRef={scrollRootRef}
      leading={null}
      {...(leaveHref
        ? {
            dockBack: true as const,
            backFallbackHref: leaveHref,
          }
        : {})}
      heading={<DiscoverNavSearch />}
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
   * When set (portfolio `/@account/discover`), dock leave goes to that page.
   * App `/discover` uses arrival leave only if you came from elsewhere.
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
