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
  scrollRootRef,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  return (
    <OsAppScreen
      title="Discover"
      leading={null}
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
  backFallbackHref: _backFallbackHref,
  initialPage = null,
}: {
  /** Ignored — Discover root uses section mark + launcher. */
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
      <DiscoverPageScreen scrollRootRef={scrollRootRef} />
    </DiscoverPanelRoot>
  );
}
