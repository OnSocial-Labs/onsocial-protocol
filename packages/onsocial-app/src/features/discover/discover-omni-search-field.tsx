'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import { OnSocialMark } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { classifyDiscoverSearch } from '@/features/discover/discover-omni-search';
import { useDiscoverSearchCopy } from '@/features/discover/use-discover-leads';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

/**
 * Discover omni search — typing filters the active tab. A plain word on
 * Moving stays there and opens grouped results. `#topic` / `$ticker`
 * switch those tabs (Enter opens the Home focus feed). Idle hint is
 * short; focused hint names what you can search.
 */
export function DiscoverOmniSearchField({ className }: { className?: string }) {
  const router = useRouter();
  const { query, setQuery, tab, face } = useDiscoverPanel();
  const [focused, setFocused] = useState(false);
  const searchCopy = useDiscoverSearchCopy(tab, face, focused);

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
          placeholder={searchCopy.placeholder}
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel={searchCopy.clearAriaLabel}
          ariaLabel={searchCopy.ariaLabel}
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </form>
    </div>
  );
}
