import {
  homeHashtagPath,
  HOME_HASHTAG_QUERY_KEY,
  normalizeHashtagQuery,
  parseHashtagCommit,
  parseHomeHashtagParam,
} from '@/features/home/home-hashtag-search';
import {
  formatTickerDisplay,
  HOME_TICKER_QUERY_KEY,
  homeTickerPath,
  normalizeTickerQuery,
  parseHomeTickerParam,
  parseTickerCommit,
} from '@/features/home/home-ticker-search';
import { APP_HOME_PATH } from '@/lib/app-routes';

export type HomeFeedFocus =
  | { kind: 'hashtag'; value: string }
  | { kind: 'ticker'; value: string };

/** Resolve Home URL focus — ticker wins if both params are present. */
export function parseHomeFeedFocus(params: {
  tag: string | null | undefined;
  ticker: string | null | undefined;
}): HomeFeedFocus | null {
  const ticker = parseHomeTickerParam(params.ticker);
  if (ticker) return { kind: 'ticker', value: ticker };
  const tag = parseHomeHashtagParam(params.tag);
  if (tag) return { kind: 'hashtag', value: tag };
  return null;
}

export function homeFeedFocusPath(focus: HomeFeedFocus): string {
  return focus.kind === 'ticker'
    ? homeTickerPath(focus.value)
    : homeHashtagPath(focus.value);
}

export function homeFeedFocusQueryValue(focus: HomeFeedFocus | null): string {
  if (!focus) return '';
  return focus.kind === 'ticker'
    ? formatTickerDisplay(focus.value)
    : `#${focus.value}`;
}

export function homeFeedFocusEmptyCopy(focus: HomeFeedFocus): string {
  if (focus.kind === 'ticker') {
    return `No posts about ${formatTickerDisplay(focus.value)} yet.`;
  }
  return `No posts tagged #${focus.value} yet.`;
}

/**
 * Commit typed search: `$x` forces ticker; `#x` forces hashtag;
 * bare words stay hashtags (existing UX). Tickers also commit via suggestion.
 */
export function parseHomeFeedFocusCommit(raw: string): HomeFeedFocus | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('$')) {
    const ticker = parseTickerCommit(trimmed);
    return ticker ? { kind: 'ticker', value: ticker } : null;
  }
  if (trimmed.startsWith('#')) {
    const tag = parseHashtagCommit(trimmed);
    return tag ? { kind: 'hashtag', value: tag } : null;
  }
  const tag = parseHashtagCommit(trimmed);
  return tag ? { kind: 'hashtag', value: tag } : null;
}

export function homeFeedFocusClearPath(): string {
  return APP_HOME_PATH;
}

export {
  HOME_HASHTAG_QUERY_KEY,
  HOME_TICKER_QUERY_KEY,
  normalizeHashtagQuery,
  normalizeTickerQuery,
  formatTickerDisplay,
};
