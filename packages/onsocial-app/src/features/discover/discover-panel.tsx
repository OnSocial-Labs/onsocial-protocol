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

export function DiscoverOverlaySheet({
  accountId: _accountId,
  initialPage = null,
}: {
  accountId: string;
  initialPage?: DiscoverProfilesResponse | null;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  return (
    <DiscoverPanelRoot
      shellVariant="overlay"
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
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
  children,
}: {
  shellVariant: DiscoverShellVariant;
  scrollRootRef: RefObject<HTMLElement | null>;
  initialPage?: DiscoverProfilesResponse | null;
  children: ReactNode;
}) {
  return (
    <DiscoverPanelProvider
      shellVariant={shellVariant}
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
    >
      {children}
    </DiscoverPanelProvider>
  );
}
