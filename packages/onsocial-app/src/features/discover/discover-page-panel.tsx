'use client';

import { useRef, type RefObject } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import { DiscoverOmniSearchField } from '@/features/discover/discover-omni-search-field';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';

function DiscoverPageScreen({
  backFallbackHref,
  scrollRootRef,
}: {
  backFallbackHref: string;
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  const { subtitle } = useDiscoverPanel();

  return (
    <OsAppScreen
      title="Discover"
      subtitle={subtitle}
      backFallbackHref={backFallbackHref}
      scrollRootRef={scrollRootRef}
      toolbar={<DiscoverOmniSearchField className="os-app-screen-search" />}
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
