import { withPostQuotesTab, type PostQuotesTab } from '@/lib/post-routes';

export type ThreadShareRow = {
  label: 'View quotes' | 'View reposts';
  count: number;
  tab: PostQuotesTab;
};

function shareCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * One quiet row under the replies. The count matches the card share total
 * (quotes + reposts). Any quotes keep the label "View quotes" and open that
 * tab. Reposts alone say "View reposts" and open the Reposts tab.
 */
export function resolveThreadShareRow(
  quoteCount: number,
  repostCount: number
): ThreadShareRow | null {
  const quotes = shareCount(quoteCount);
  const reposts = shareCount(repostCount);
  if (quotes + reposts <= 0) return null;
  if (quotes > 0) {
    return {
      label: 'View quotes',
      count: quotes + reposts,
      tab: 'quotes',
    };
  }
  return {
    label: 'View reposts',
    count: reposts,
    tab: 'reposts',
  };
}

export function threadShareRowHref(
  baseHref: string,
  row: ThreadShareRow
): string {
  return withPostQuotesTab(baseHref, row.tab);
}
