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
  /** Secondary sale of another creator's work — badge reads “Resale”. */
  resale?: boolean;
  /** Drop id when known — used to dedupe against live drop cards. */
  collectionId?: string | null;
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
  /** Source post when the sale was listed from a thread. */
  sourcePostPath?: string;
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
  /** NEP-177 `extra.kind` — Ticket, Audio, Writing, … */
  mediumKind?: string | null;
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  writingFormat?: 'issue' | 'book' | null;
  /** Clip on cover — show listen glyph (opens collection). */
  hasPlayable?: boolean;
  /** When the drop was created (ms) — relative time in action column. */
  createdAtMs?: number | null;
  /** Loved fan count when known (> 0). */
  fanCount?: number;
  /** Top recent fan account ids for list facepile (≤ 5). */
  fanIds?: string[];
}

export interface ProfileStoreShelf {
  listings: ProfileStoreListing[];
  drops: ProfileStoreDrop[];
  sales: ProfileStoreSale[];
  /** Live listings previewed on the shelf. */
  listingCount: number;
  /** More listings exist than the seed — the Store tab pages them in place. */
  hasMore: boolean;
}

export const EMPTY_PROFILE_STORE: ProfileStoreShelf = {
  listings: [],
  drops: [],
  sales: [],
  listingCount: 0,
  hasMore: false,
};
