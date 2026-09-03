'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type FormEvent } from 'react';
import { OnSocialMark } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { classifyDiscoverSearch } from '@/features/discover/discover-omni-search';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

const IDLE_PLACEHOLDER = 'Search';

/**
 * Discover omni search — typing filters the active tab. Bare text on
 * Moving opens Profiles. `#topic` / `$ticker` switch those tabs
 * (Enter opens the Home focus feed). Idle hint is short; focused hint
 * names what you can search.
 */
export function DiscoverOmniSearchField({ className }: { className?: string }) {
  const router = useRouter();
  const { query, setQuery, tab } = useDiscoverPanel();
  const [focused, setFocused] = useState(false);

  const focusPlaceholder =
    tab === 'daos'
      ? 'DAO account or name'
      : tab === 'guilds'
        ? 'Search guilds'
        : tab === 'hubs'
          ? 'Search hubs'
          : // Moving + Profiles (+ topics/tickers) share one omni hint.
            'People, #topics, $tickers';
  const searchPlaceholder = focused ? focusPlaceholder : IDLE_PLACEHOLDER;
  const searchAriaLabel =
    tab === 'daos'
      ? 'Search DAOs'
      : tab === 'guilds'
        ? 'Search guilds'
        : tab === 'hubs'
          ? 'Search hubs'
          : 'Search people, topics, and tickers';

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
          placeholder={searchPlaceholder}
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </form>
    </div>
  );
}
