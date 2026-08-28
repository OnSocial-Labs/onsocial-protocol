'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import {
  DiscoverPanelProvider,
  type DiscoverShellVariant,
} from '@/features/discover/discover-panel-context';
import { DiscoverSheetHeader } from '@/features/discover/discover-sheet-header';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';

export function DiscoverOverlaySheet({
  accountId: _accountId,
  initialPage = null,
  initialTrending = null,
  initialGuilds = null,
}: {
  accountId: string;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  initialGuilds?: GuildSummaryCardModel[] | null;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  return (
    <DiscoverPanelRoot
      shellVariant="overlay"
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
      initialTrending={initialTrending}
      initialGuilds={initialGuilds}
    >
      <OverlayPanelChrome
        ariaTitle="Discover"
        toolbar={<DiscoverSheetHeader />}
        scrollBodyRef={scrollRootRef}
      />
      <DiscoverPanelContent />
    </DiscoverPanelRoot>
  );
}

export function DiscoverPanelRoot({
  shellVariant,
  scrollRootRef,
  initialPage = null,
  initialTrending = null,
  initialGuilds = null,
  children,
}: {
  shellVariant: DiscoverShellVariant;
  scrollRootRef: RefObject<HTMLElement | null>;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  initialGuilds?: GuildSummaryCardModel[] | null;
  children: ReactNode;
}) {
  return (
    <DiscoverPanelProvider
      shellVariant={shellVariant}
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
      initialTrending={initialTrending}
      initialGuilds={initialGuilds}
    >
      {children}
    </DiscoverPanelProvider>
  );
}
