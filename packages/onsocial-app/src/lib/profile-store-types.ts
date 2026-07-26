/**
 * Pure types + defaults for the creator Store shelf. Kept free of server-only
 * imports so client components can use {@link EMPTY_PROFILE_STORE} without
 * pulling the server fetch (and the OnSocial client) into their bundle.
 */

export interface ProfileStoreListing {
  key: string;
  kind: 'lazy' | 'native' | 'auction';
  title: string;
  /** Display price in NEAR (already localized), or null when unpriced. */
  priceNear: string | null;
  /** Disambiguates auction vs fixed vs edition price. */
  priceLabel: 'Ask' | 'Reserve' | 'High bid' | 'From';
  mediaUrl: string | null;
  tokenId?: string;
  listingId?: string;
  sourcePostPath?: string;
  /** Unsold editions on a lazy listing. */
  remaining?: number;
  bidCount?: number;
  expiresAtNs?: number | null;
}

export interface ProfileStoreSale {
  key: string;
  title: string;
  priceNear: string | null;
  buyerId: string | null;
  blockTimestamp: number;
  mediaUrl: string | null;
}

/** A collection (drop) card on the creator's Store shelf. */
export interface ProfileStoreDrop {
  key: string;
  collectionId: string;
  title: string;
  mediaUrl: string | null;
  /** Display price per edition in NEAR, or null when free. */
  priceNear: string | null;
  remaining: number;
  totalSupply: number;
  status:
    | 'upcoming'
    | 'live'
    | 'sold_out'
    | 'ended'
    | 'paused'
    | 'cancelled';
}

export interface ProfileStoreShelf {
  listings: ProfileStoreListing[];
  drops: ProfileStoreDrop[];
  sales: ProfileStoreSale[];
  /** Live listings previewed on the shelf. */
  listingCount: number;
  /** More listings exist than the preview — deep-link to Market to see all. */
  hasMore: boolean;
}

export const EMPTY_PROFILE_STORE: ProfileStoreShelf = {
  listings: [],
  drops: [],
  sales: [],
  listingCount: 0,
  hasMore: false,
};
