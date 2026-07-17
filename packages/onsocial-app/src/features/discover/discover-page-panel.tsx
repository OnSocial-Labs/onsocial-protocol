'use client';

import { useRef, type RefObject } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import {
  DiscoverHeaderTabs,
  DiscoverNavSearch,
} from '@/features/discover/discover-screen-chrome';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';

function DiscoverPageScreen({
  backFallbackHref,
  scrollRootRef,
}: {
  backFallbackHref: string;
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  return (
    <OsAppScreen
      title="Discover"
      backFallbackHref={backFallbackHref}
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
  backFallbackHref = '/',
  initialPage = null,
}: {
  backFallbackHref?: string;
  initialPage?: DiscoverProfilesResponse | null;
}) {
  const scrollRootRef = useRef<HTMLElement>(null);

  return (
    <DiscoverPanelRoot
      shellVariant="page"
      scrollRootRef={scrollRootRef}
      initialPage={initialPage}
    >
      <DiscoverPageScreen
        backFallbackHref={backFallbackHref}
        scrollRootRef={scrollRootRef}
      />
    </DiscoverPanelRoot>
  );
}
