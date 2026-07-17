import type { HashtagCount, TickerCount } from '@onsocial/sdk';
import {
  normalizeHashtagQuery,
  normalizeTickerQuery,
} from '@/features/home/home-feed-focus';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export type DiscoverTopicSuggestRow =
  | { kind: 'hashtag'; item: HashtagCount }
  | { kind: 'ticker'; item: TickerCount };

const SUGGEST_LIMIT = 6;

/** Topic/ticker autocomplete while drafting `#` / `$` in Discover. */
export async function loadDiscoverTopicSuggestions(
  raw: string
): Promise<DiscoverTopicSuggestRow[]> {
  const trimmed = raw.trim();
  const wantsTicker = trimmed.startsWith('$');
  const wantsHashtag = trimmed.startsWith('#');
  if (!wantsTicker && !wantsHashtag) return [];

  const client = createReadOnlyOnSocialClient();
  const rows: DiscoverTopicSuggestRow[] = [];
  const hashtagPrefix = normalizeHashtagQuery(trimmed);
  const tickerPrefix = normalizeTickerQuery(trimmed);

  if (wantsTicker) {
    const tickers = tickerPrefix
      ? await client.query.tickers
          .search(tickerPrefix, { limit: SUGGEST_LIMIT })
          .catch(() => [] as TickerCount[])
      : await client.query.tickers
          .trending({ limit: SUGGEST_LIMIT })
          .catch(() => [] as TickerCount[]);
    for (const item of tickers) rows.push({ kind: 'ticker', item });
    return rows;
  }

  const tags = hashtagPrefix
    ? await client.query.hashtags
        .search(hashtagPrefix, { limit: SUGGEST_LIMIT })
        .catch(() => [] as HashtagCount[])
    : await client.query.hashtags
        .trending({ limit: SUGGEST_LIMIT })
        .catch(() => [] as HashtagCount[]);
  for (const item of tags) rows.push({ kind: 'hashtag', item });
  return rows;
}
