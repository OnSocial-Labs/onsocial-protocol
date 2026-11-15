'use client';

import { useRouter } from 'next/navigation';
import { useCallback, type FormEvent } from 'react';
import { OnSocialMark } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import {
  classifyDiscoverSearch,
  discoverSearchAriaLabel,
} from '@/features/discover/discover-omni-search';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

const IDLE_PLACEHOLDER = 'Search';

/**
 * Discover omni search — typing filters the active tab. Idle hint stays
 * `Search`; aria-label names the surface (no focus placeholder swap / flash).
 */
export function DiscoverOmniSearchField({ className }: { className?: string }) {
  const router = useRouter();
  const { query, setQuery, tab, face } = useDiscoverPanel();
  const searchAriaLabel = discoverSearchAriaLabel(tab, face);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const intent = classifyDiscoverSearch(query);
      if (intent.kind === 'people') return;
      setQuery('');
      router.push(intent.href);
    },
    [query, router, setQuery]
  );

  return (
    <div className="discover-omni-search">
      <form className="discover-omni-search-form" onSubmit={handleSubmit}>
        <OsAppChromeNavSearch
          value={query}
          onValueChange={setQuery}
          placeholder={IDLE_PLACEHOLDER}
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear search"
          ariaLabel={searchAriaLabel}
          idleClassName={
            className
              ? `discover-nav-search-field ${className}`
              : 'discover-nav-search-field'
          }
          leadingIcon={
            <OnSocialMark
              className="search-field-icon discover-nav-search-mark"
              aria-hidden
            />
          }
        />
      </form>
    </div>
  );
}
