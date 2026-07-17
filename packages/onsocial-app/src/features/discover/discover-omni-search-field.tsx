'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SearchField } from '@/components/ui/search-field';
import {
  classifyDiscoverSearch,
  isDiscoverTopicDraft,
} from '@/features/discover/discover-omni-search';
import { useDiscoverPanel } from '@/features/discover/discover-panel-context';
import {
  loadDiscoverTopicSuggestions,
  type DiscoverTopicSuggestRow,
} from '@/features/discover/discover-topic-suggest';
import { homeHashtagPath } from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  homeTickerPath,
} from '@/features/home/home-ticker-search';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

const SUGGEST_DEBOUNCE_MS = 220;

/**
 * Omni search entry for Discover. Bare text drives live people search; an
 * explicit `#topic` / `$ticker` shows topic suggestions and hands off to the
 * Home focused feed on pick or Enter.
 */
export function DiscoverOmniSearchField({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const { query, setQuery } = useDiscoverPanel();
  const [suggestions, setSuggestions] = useState<DiscoverTopicSuggestRow[]>(
    []
  );
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused || !isDiscoverTopicDraft(query)) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadDiscoverTopicSuggestions(query)
        .then((rows) => {
          if (cancelled) return;
          setSuggestions(rows);
          setSuggestOpen(rows.length > 0);
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setSuggestOpen(false);
          }
        });
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [focused, query]);

  const closeSuggestions = useCallback(() => {
    setSuggestions([]);
    setSuggestOpen(false);
  }, []);

  const navigateToTopic = useCallback(
    (href: string) => {
      setQuery('');
      closeSuggestions();
      router.push(href);
    },
    [closeSuggestions, router, setQuery]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const intent = classifyDiscoverSearch(query);
      if (intent.kind === 'people') return;
      navigateToTopic(intent.href);
    },
    [navigateToTopic, query]
  );

  const showSuggestions =
    focused && isDiscoverTopicDraft(query) && suggestOpen && suggestions.length > 0;

  return (
    <div className="discover-omni-search">
      <form className="discover-omni-search-form" onSubmit={handleSubmit}>
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder="Search people, #topics, $tickers"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear search"
          ariaLabel="Search people, topics, and tickers"
          chrome="floating-panel"
          className={className}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setFocused(false);
              closeSuggestions();
            }, 120);
          }}
        />
      </form>
      {showSuggestions ? (
        <div
          className="discover-omni-suggest home-hashtag-suggest"
          role="listbox"
          aria-label="Topic and ticker suggestions"
        >
          {suggestions.map((row) => {
            if (row.kind === 'hashtag') {
              return (
                <button
                  key={`h-${row.item.hashtag}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="home-hashtag-suggest-item"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    navigateToTopic(homeHashtagPath(row.item.hashtag));
                  }}
                >
                  <span className="home-hashtag-suggest-tag">
                    #{row.item.hashtag}
                  </span>
                  <span className="home-hashtag-suggest-meta">Topic</span>
                  <span className="home-hashtag-suggest-count">
                    {row.item.postCount}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={`t-${row.item.ticker}`}
                type="button"
                role="option"
                aria-selected={false}
                className="home-hashtag-suggest-item home-hashtag-suggest-item--ticker"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  navigateToTopic(homeTickerPath(row.item.ticker));
                }}
              >
                <span className="home-hashtag-suggest-tag home-hashtag-suggest-tag--ticker">
                  {formatTickerDisplay(row.item.ticker)}
                </span>
                <span className="home-hashtag-suggest-meta">Ticker</span>
                <span className="home-hashtag-suggest-count">
                  {row.item.postCount}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
