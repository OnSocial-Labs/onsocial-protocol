'use client';

import { useEffect, useId, useState } from 'react';
import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import {
  Divider,
  GlassSheet,
  SearchField,
  SheetCloseButton,
} from '@onsocial/ui';
import { DiscoverFocusListSkeleton } from '@/features/discover/discover-loading-skeleton';
import {
  formatTickerDisplay,
  homeFeedFocusKey,
  normalizeHashtagQuery,
  normalizeTickerQuery,
  parseHomeFeedFocusCommit,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';
import { useScrollLock } from '@/hooks/use-scroll-lock';

const SUGGEST_DEBOUNCE_MS = 220;
const SUGGEST_LIMIT = 12;

type SuggestRow =
  | { kind: 'hashtag'; item: HashtagCount }
  | { kind: 'ticker'; item: TickerCount };

async function loadFocusSuggestions(query: string): Promise<SuggestRow[]> {
  const trimmed = query.trim();
  const wantsTicker = trimmed.startsWith('$');
  const wantsHashtag = trimmed.startsWith('#');
  const hashtagPrefix = normalizeHashtagQuery(trimmed);
  const tickerPrefix = normalizeTickerQuery(trimmed);
  const client = createReadOnlyOnSocialClient();
  const rows: SuggestRow[] = [];

  if (wantsTicker) {
    const tickers = tickerPrefix
      ? await client.query.tickers.search(tickerPrefix, { limit: SUGGEST_LIMIT })
      : await client.query.tickers.trending({ limit: SUGGEST_LIMIT });
    for (const item of tickers) rows.push({ kind: 'ticker', item });
    return rows;
  }

  if (wantsHashtag) {
    const tags = hashtagPrefix
      ? await client.query.hashtags.search(hashtagPrefix, {
          limit: SUGGEST_LIMIT,
        })
      : await client.query.hashtags.trending({ limit: SUGGEST_LIMIT });
    for (const item of tags) rows.push({ kind: 'hashtag', item });
    return rows;
  }

  const [tags, tickers] = await Promise.all([
    (hashtagPrefix
      ? client.query.hashtags.search(hashtagPrefix, { limit: SUGGEST_LIMIT })
      : client.query.hashtags.trending({ limit: SUGGEST_LIMIT })
    ).catch(() => [] as HashtagCount[]),
    (tickerPrefix
      ? client.query.tickers.search(tickerPrefix, { limit: SUGGEST_LIMIT })
      : client.query.tickers.trending({ limit: SUGGEST_LIMIT })
    ).catch(() => [] as TickerCount[]),
  ]);
  for (const item of tags) rows.push({ kind: 'hashtag', item });
  for (const item of tickers) rows.push({ kind: 'ticker', item });
  return rows;
}

export function HomeSavedFeedSheet({
  open,
  onClose,
  onAddFocus,
  existingFocusKeys,
}: {
  open: boolean;
  onClose: () => void;
  onAddFocus: (focus: HomeFeedFocus) => void;
  existingFocusKeys: ReadonlySet<string>;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SuggestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const sheetOpen = open && !closing;

  useScrollLock(open || closing);

  useEffect(() => {
    if (!open) {
      setClosing(false);
      setQuery('');
      setRows([]);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!sheetOpen) return;

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await loadFocusSuggestions(query);
          if (!cancelled) setRows(next);
        } catch {
          if (!cancelled) setRows([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, sheetOpen]);

  const requestClose = () => setClosing(true);

  const pick = (focus: HomeFeedFocus) => {
    onAddFocus(focus);
    setClosing(true);
  };

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={() => {
        setClosing(false);
        onClose();
      }}
      tone="os"
      initialDetent="full"
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close add feed"
      panelClassName="home-saved-feed-sheet-panel"
      bodyClassName="home-saved-feed-sheet-body"
      header={
        <>
          <div className="standing-sheet-header home-saved-feed-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Add feed
                  </h2>
                  <p className="discover-sheet-subtitle">
                    Pick a #topic or $ticker. Saved on this device.
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="home-saved-feed-sheet">
        <form
          className="home-saved-feed-sheet-search"
          onSubmit={(event) => {
            event.preventDefault();
            const focus = parseHomeFeedFocusCommit(query);
            if (!focus) return;
            pick(focus);
          }}
        >
          <SearchField
            value={query}
            onValueChange={setQuery}
            placeholder="Search #topics or $tickers"
            maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
            clearAriaLabel="Clear topic search"
            ariaLabel="Search topics or tickers"
            chrome="floating-panel"
            className="home-saved-feed-sheet-search-field"
          />
        </form>

        <p className="home-saved-feed-sheet-section-label">
          {query.trim() ? 'Matches' : 'Trending'}
        </p>

        {loading && rows.length === 0 ? (
          <>
            <p className="sr-only">Loading topics and tickers…</p>
            <DiscoverFocusListSkeleton rows={6} />
          </>
        ) : null}

        {!loading && rows.length === 0 ? (
          <p className="home-saved-feed-sheet-state">
            No topics or tickers found.
          </p>
        ) : null}

        <div
          className={`home-saved-feed-sheet-list${
            loading && rows.length > 0 ? ' is-refreshing' : ''
          }`}
          role="listbox"
          aria-busy={loading || undefined}
          aria-label="Topics and tickers"
        >
          {rows.map((row) => {
            if (row.kind === 'hashtag') {
              const focus: HomeFeedFocus = {
                kind: 'hashtag',
                value: row.item.hashtag,
              };
              const saved = existingFocusKeys.has(homeFeedFocusKey(focus));
              return (
                <button
                  key={`h-${row.item.hashtag}`}
                  type="button"
                  role="option"
                  aria-selected={saved}
                  className={`home-hashtag-suggest-item${saved ? ' is-saved' : ''}`}
                  onClick={() => pick(focus)}
                >
                  <span className="home-hashtag-suggest-tag">
                    #{row.item.hashtag}
                  </span>
                  <span className="home-hashtag-suggest-meta">
                    {saved ? 'Saved' : 'Topic'}
                  </span>
                  <span className="home-hashtag-suggest-count">
                    {row.item.postCount}
                  </span>
                </button>
              );
            }

            const focus: HomeFeedFocus = {
              kind: 'ticker',
              value: row.item.ticker,
            };
            const saved = existingFocusKeys.has(homeFeedFocusKey(focus));
            return (
              <button
                key={`t-${row.item.ticker}`}
                type="button"
                role="option"
                aria-selected={saved}
                className={`home-hashtag-suggest-item home-hashtag-suggest-item--ticker${saved ? ' is-saved' : ''}`}
                onClick={() => pick(focus)}
              >
                <span className="home-hashtag-suggest-tag home-hashtag-suggest-tag--ticker">
                  {formatTickerDisplay(row.item.ticker)}
                </span>
                <span className="home-hashtag-suggest-meta">
                  {saved ? 'Saved' : 'Ticker'}
                </span>
                <span className="home-hashtag-suggest-count">
                  {row.item.postCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </GlassSheet>
  );
}
