'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import {
  DiscoverPanelProvider,
  type DiscoverShellVariant,
} from '@/features/discover/discover-panel-context';
import { DiscoverSheetHeader } from '@/features/discover/discover-sheet-header';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';

export function DiscoverOverlaySheet({
  accountId: _accountId,
  initialPage = null,
  initialTrending = null,
}: {
  accountId: string;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  return (
    <DiscoverPanelRoot
      shellVariant="overlay"
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
      initialTrending={initialTrending}
    >
      <OverlayPanelChrome
        ariaTitle="Discover"
        toolbar={<DiscoverSheetHeader />}
        scrollBodyRef={scrollRootRef}
        showHeaderDivider={false}
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
  children,
}: {
  shellVariant: DiscoverShellVariant;
  scrollRootRef: RefObject<HTMLElement | null>;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  children: ReactNode;
}) {
  return (
    <DiscoverPanelProvider
      shellVariant={shellVariant}
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
      initialTrending={initialTrending}
    >
      {children}
    </DiscoverPanelProvider>
  );
}
