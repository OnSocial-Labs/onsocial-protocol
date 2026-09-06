import {
  isMarketListingEnded,
  type MarketListingItem,
} from '@/features/market/market-listings';

export { isMarketListingEnded };

/**
 * All / Auctions: live Buy · Bid · Mint first. Ended Settle keeps
 * indexer order, but trails so a busy market is not a settle pile.
 */
export function partitionMarketListingsLiveFirst(
  items: readonly MarketListingItem[],
  nowMs: number
): { live: MarketListingItem[]; ended: MarketListingItem[] } {
  const live: MarketListingItem[] = [];
  const ended: MarketListingItem[] = [];
  for (const item of items) {
    if (isMarketListingEnded(item, nowMs)) ended.push(item);
    else live.push(item);
  }
  return { live, ended };
}
