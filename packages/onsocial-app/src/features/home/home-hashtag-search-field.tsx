'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HashtagCount } from '@onsocial/sdk';
import { SearchField } from '@/components/ui/search-field';
import {
  normalizeHashtagQuery,
  parseHashtagCommit,
} from '@/features/home/home-hashtag-search';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

const SUGGEST_DEBOUNCE_MS = 220;
const SUGGEST_LIMIT = 8;

export function HomeHashtagSearch({
  query,
  onQueryChange,
  activeTag,
  onCommitTag,
  onClear,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  activeTag: string | null;
  onCommitTag: (tag: string) => void;
  onClear: () => void;
}) {
  const [suggestions, setSuggestions] = useState<HashtagCount[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (activeTag || !focused) return;

    const prefix = normalizeHashtagQuery(query);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const client = createReadOnlyOnSocialClient();
          const matches = prefix
            ? await client.query.hashtags.search(prefix, {
                limit: SUGGEST_LIMIT,
              })
            : await client.query.hashtags.trending({ limit: SUGGEST_LIMIT });
          if (!cancelled) {
            setSuggestions(matches);
            setSuggestOpen(matches.length > 0);
          }
        } catch {
          if (!cancelled) {
            setSuggestions([]);
            setSuggestOpen(false);
          }
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTag, focused, query]);

  const closeSuggestions = useCallback(() => {
    setSuggestions([]);
    setSuggestOpen(false);
  }, []);

  const handleValueChange = useCallback(
    (value: string) => {
      onQueryChange(value);
      if (!value.trim()) {
        onClear();
        closeSuggestions();
      }
    },
    [closeSuggestions, onClear, onQueryChange]
  );

  const showSuggestions =
    !activeTag && focused && suggestOpen && suggestions.length > 0;

  return (
    <div className="home-hashtag-search">
      <form
        className="home-hashtag-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          const tag = parseHashtagCommit(query);
          if (!tag) return;
          onCommitTag(tag);
          closeSuggestions();
        }}
      >
        <SearchField
          value={query}
          onValueChange={handleValueChange}
          placeholder="Search hashtags"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear hashtag search"
          ariaLabel="Search hashtags"
          chrome="floating-panel"
          className="home-feed-toolbar-search os-app-screen-search"
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
          className="home-hashtag-suggest"
          role="listbox"
          aria-label={
            normalizeHashtagQuery(query)
              ? 'Hashtag suggestions'
              : 'Trending hashtags'
          }
        >
          {suggestions.map((item) => (
            <button
              key={item.hashtag}
              type="button"
              role="option"
              className="home-hashtag-suggest-item"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onCommitTag(item.hashtag);
                closeSuggestions();
              }}
            >
              <span className="home-hashtag-suggest-tag">#{item.hashtag}</span>
              <span className="home-hashtag-suggest-count">
                {item.postCount}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
