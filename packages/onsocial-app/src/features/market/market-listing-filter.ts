/** All / Fixed / Auctions — page chrome, not the medium Filter drawer. */
export type MarketListingFilter = 'all' | 'fixed' | 'auctions';

export const MARKET_LISTING_FILTERS: ReadonlyArray<{
  id: MarketListingFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'auctions', label: 'Auctions' },
];

/** Ending-soon sort is auction clocks only. */
export function listingFilterFromSort(
  sort: string | null | undefined
): MarketListingFilter {
  return sort === 'ending' ? 'auctions' : 'all';
}
