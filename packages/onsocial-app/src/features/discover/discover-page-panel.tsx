'use client';

import { useRef, type RefObject } from 'react';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { SearchField } from '@/components/ui/search-field';
import { DiscoverPanelContent } from '@/features/discover/discover-panel-content';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

function DiscoverPageScreen({
  backFallbackHref,
  scrollRootRef,
}: {
  backFallbackHref: string;
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  const { subtitle, query, setQuery } = useDiscoverPanel();

  return (
    <OsAppScreen
      title="Discover"
      subtitle={subtitle}
      backFallbackHref={backFallbackHref}
      scrollRootRef={scrollRootRef}
      toolbar={
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder="Search names or accounts"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear profile search"
          ariaLabel="Search discover profiles"
          className="os-app-screen-search"
        />
      }
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
