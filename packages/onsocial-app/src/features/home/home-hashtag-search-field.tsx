'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import { SearchField } from '@/components/ui/search-field';
import {
  formatTickerDisplay,
  normalizeHashtagQuery,
  normalizeTickerQuery,
  parseHomeFeedFocusCommit,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';

const SUGGEST_DEBOUNCE_MS = 220;
const SUGGEST_LIMIT = 6;

type SuggestRow =
  | { kind: 'hashtag'; item: HashtagCount }
  | { kind: 'ticker'; item: TickerCount };

export function HomeFeedFocusSearch({
  query,
  onQueryChange,
  activeFocus,
  onCommitFocus,
  onClear,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  activeFocus: HomeFeedFocus | null;
  onCommitFocus: (focus: HomeFeedFocus) => void;
  onClear: () => void;
}) {
  const [suggestions, setSuggestions] = useState<SuggestRow[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (activeFocus || !focused) return;

    const trimmed = query.trim();
    const wantsTicker = trimmed.startsWith('$');
    const wantsHashtag = trimmed.startsWith('#');
    const hashtagPrefix = normalizeHashtagQuery(trimmed);
    const tickerPrefix = normalizeTickerQuery(trimmed);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const client = createReadOnlyOnSocialClient();
          const rows: SuggestRow[] = [];

          if (wantsTicker) {
            const tickers = tickerPrefix
              ? await client.query.tickers.search(tickerPrefix, {
                  limit: SUGGEST_LIMIT,
                })
              : await client.query.tickers.trending({ limit: SUGGEST_LIMIT });
            for (const item of tickers) {
              rows.push({ kind: 'ticker', item });
            }
          } else if (wantsHashtag) {
            const tags = hashtagPrefix
              ? await client.query.hashtags.search(hashtagPrefix, {
                  limit: SUGGEST_LIMIT,
                })
              : await client.query.hashtags.trending({ limit: SUGGEST_LIMIT });
            for (const item of tags) {
              rows.push({ kind: 'hashtag', item });
            }
          } else {
            const [tags, tickers] = await Promise.all([
              hashtagPrefix
                ? client.query.hashtags.search(hashtagPrefix, {
                    limit: SUGGEST_LIMIT,
                  })
                : client.query.hashtags.trending({ limit: SUGGEST_LIMIT }),
              tickerPrefix
                ? client.query.tickers.search(tickerPrefix, {
                    limit: SUGGEST_LIMIT,
                  })
                : client.query.tickers.trending({ limit: SUGGEST_LIMIT }),
            ]);
            for (const item of tags) rows.push({ kind: 'hashtag', item });
            for (const item of tickers) rows.push({ kind: 'ticker', item });
          }

          if (!cancelled) {
            setSuggestions(rows);
            setSuggestOpen(rows.length > 0);
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
  }, [activeFocus, focused, query]);

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
    !activeFocus && focused && suggestOpen && suggestions.length > 0;

  return (
    <div className="home-hashtag-search">
      <form
        className="home-hashtag-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          const focus = parseHomeFeedFocusCommit(query);
          if (!focus) return;
          onCommitFocus(focus);
          closeSuggestions();
        }}
      >
        <SearchField
          value={query}
          onValueChange={handleValueChange}
          placeholder="Search #topics or $tickers"
          maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
          clearAriaLabel="Clear feed search"
          ariaLabel="Search topics or tickers"
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
                    onCommitFocus({
                      kind: 'hashtag',
                      value: row.item.hashtag,
                    });
                    closeSuggestions();
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
                  onCommitFocus({
                    kind: 'ticker',
                    value: row.item.ticker,
                  });
                  closeSuggestions();
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

/** @deprecated Prefer {@link HomeFeedFocusSearch}. */
export { HomeFeedFocusSearch as HomeHashtagSearch };
