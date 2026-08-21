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
import {
  HOME_PLACE_QUERY_KEY,
  homePlaceEmptyCopy,
  homePlacePath,
  normalizePlaceSlug,
  parseHomePlaceParam,
  placeLabel,
} from '@/lib/post-place';
import { APP_HOME_PATH } from '@/lib/app-routes';

export type HomeFeedFocus =
  | { kind: 'hashtag'; value: string }
  | { kind: 'ticker'; value: string }
  | { kind: 'place'; value: string };

/** Resolve Home URL focus — ticker > place > tag if multiple params present. */
export function parseHomeFeedFocus(params: {
  tag: string | null | undefined;
  ticker: string | null | undefined;
  place?: string | null | undefined;
}): HomeFeedFocus | null {
  const ticker = parseHomeTickerParam(params.ticker);
  if (ticker) return { kind: 'ticker', value: ticker };
  const place = parseHomePlaceParam(params.place);
  if (place) return { kind: 'place', value: place };
  const tag = parseHomeHashtagParam(params.tag);
  if (tag) return { kind: 'hashtag', value: tag };
  return null;
}

export function homeFeedFocusPath(focus: HomeFeedFocus): string {
  if (focus.kind === 'ticker') return homeTickerPath(focus.value);
  if (focus.kind === 'place') return homePlacePath(focus.value);
  return homeHashtagPath(focus.value);
}

export function homeFeedFocusQueryValue(focus: HomeFeedFocus | null): string {
  if (!focus) return '';
  if (focus.kind === 'ticker') return formatTickerDisplay(focus.value);
  if (focus.kind === 'place') return placeLabel(focus.value) ?? focus.value;
  return `#${focus.value}`;
}

export function homeFeedFocusEmptyCopy(focus: HomeFeedFocus): string {
  if (focus.kind === 'ticker') {
    return `No posts about ${formatTickerDisplay(focus.value)} yet.`;
  }
  if (focus.kind === 'place') {
    return homePlaceEmptyCopy(focus.value);
  }
  return `No posts tagged #${focus.value} yet.`;
}

/**
 * Commit typed search: `$x` forces ticker; `#x` forces hashtag;
 * bare words stay hashtags (existing UX). Places commit via Discover chips.
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

/** Stable string for effects — avoids re-fetch loops from new object identity. */
export function homeFeedFocusKey(focus: HomeFeedFocus | null): string {
  if (!focus) return '';
  return `${focus.kind}:${focus.value}`;
}

export {
  HOME_HASHTAG_QUERY_KEY,
  HOME_TICKER_QUERY_KEY,
  HOME_PLACE_QUERY_KEY,
  normalizeHashtagQuery,
  normalizeTickerQuery,
  normalizePlaceSlug,
  formatTickerDisplay,
  placeLabel,
};
