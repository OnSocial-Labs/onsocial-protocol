// ---------------------------------------------------------------------------
// Scarces event queries (mints, sales, listings, auctions, offers, app pool).
// Accessed as `os.query.scarces.<method>()`.
//
// Backed by the `scarces_events` table populated by the scarces substreams
// indexer. Most columns are sparse — populated only for the relevant
// `eventType` / `operation` combinations — so consumers should branch on
// those when reading the result rows.
//
// Historical activity: `events()` / helpers → `scarces_events`.
// Live Market catalog: `activeListings()` → `scarces_active_listings`
// Live drop catalog: `collectionCurrent()` / `collectionsCurrent()` /
//   `collectionsCurrentByIds()` → `scarces_collections_current`
// Rankings: `collectionLoveFans()` → `scarce_collection_love_fans`;
//   `collectionTradeStats()` → `scarces_collections_trade_stats`
// Owned inventory: `ownedBy()` → `scarces_token_owners`
// Open offers: `activeOffers()` → `scarces_active_offers`
// (sink-maintained). Buy/bid still verify against the scarces contract.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/**
 * A single row from `scarces_events`. Every event populates `eventType`,
 * `operation`, `author`, `blockHeight` and `blockTimestamp`; everything else
 * is sparse.
 */
export interface ScarcesEventRow {
  /** Top-level event family (`SCARCE_UPDATE`, `COLLECTION_UPDATE`, …). */
  eventType: string;
  /** Specific operation within that family (`quick_mint`, `purchase`, …). */
  operation: string;
  /** Account that signed the originating tx. */
  author: string;
  blockHeight: number;
  blockTimestamp: number;

  // ── Identity / routing ─────────────────────────────────────────────────
  tokenId: string | null;
  collectionId: string | null;
  listingId: string | null;
  ownerId: string | null;
  creatorId: string | null;
  buyerId: string | null;
  sellerId: string | null;
  bidder: string | null;
  accountId: string | null;
  appId: string | null;
  /** Set on cross-contract listings (external NFTs). */
  scarceContractId: string | null;

  // ── Financial (yoctoNEAR strings) ──────────────────────────────────────
  amount: string | null;
  price: string | null;
  oldPrice: string | null;
  newPrice: string | null;
  bidAmount: string | null;
  marketplaceFee: string | null;
  appPoolAmount: string | null;
  creatorPayment: string | null;

  // ── Quantity ───────────────────────────────────────────────────────────
  quantity: number | null;
  totalSupply: number | null;
  /** Populated on `redeem` — check-in count after this event. */
  redeemCount: number | null;
  /** Populated on `redeem` — collection max redeems per token. */
  maxRedeems: number | null;

  // ── Auction-specific ───────────────────────────────────────────────────
  reservePrice: string | null;
  buyNowPrice: string | null;
  expiresAt: number | null;

  // ── Misc ───────────────────────────────────────────────────────────────
  reason: string | null;
  memo: string | null;

  /** Full JSON catch-all — useful for forward-compat with new operations. */
  extraData: string | null;
}

/** Live Market row from sink-maintained `scarces_active_listings`. */
export interface ScarcesActiveListingRow {
  listingKey: string;
  kind: 'lazy' | 'native' | 'auction' | string;
  listingId: string | null;
  tokenId: string | null;
  sellerId: string;
  creatorId: string | null;
  /** App / store slug this listing was published under, when any. */
  appId: string | null;
  /** Ask / display price in yoctoNEAR. */
  price: string | null;
  /** Postgres-generated numeric mirror of `price` for server-side sorting. */
  priceNumeric: string | null;
  reservePrice: string | null;
  buyNowPrice: string | null;
  highestBid: string | null;
  bidCount: number | null;
  copies: number | null;
  remaining: number | null;
  mintedCount: number | null;
  /** Nanoseconds, when known. */
  expiresAt: number | null;
  title: string | null;
  media: string | null;
  sourcePostPath: string | null;
  cardBg: string | null;
  extraJson: string | null;
  /** NEP-177 medium (`art` / `audio` / …) — not listing kind. */
  mediumKind: string | null;
  audioFormat: string | null;
  facets: string[] | null;
  listedBlockHeight: number;
  listedBlockTimestamp: number;
  updatedBlockHeight: number;
  updatedBlockTimestamp: number;
}

const SCARCES_ACTIVE_LISTING_FIELDS = `
  listingKey
  kind
  listingId
  tokenId
  sellerId
  creatorId
  appId
  price
  priceNumeric
  reservePrice
  buyNowPrice
  highestBid
  bidCount
  copies
  remaining
  mintedCount
  expiresAt
  title
  media
  sourcePostPath
  cardBg
  extraJson
  mediumKind
  audioFormat
  facets
  listedBlockHeight
  listedBlockTimestamp
  updatedBlockHeight
  updatedBlockTimestamp
`;

/** Live drop shell from sink-maintained `scarces_collections_current`. */
export interface ScarcesCollectionCurrentRow {
  collectionId: string;
  creatorId: string;
  appId: string | null;
  /** Ask per edition in yoctoNEAR. */
  price: string | null;
  allowlistPrice: string | null;
  totalSupply: number;
  mintedCount: number;
  remaining: number;
  /** Nanoseconds when set. */
  startTime: number | null;
  endTime: number | null;
  createdAt: number | null;
  mintMode: string | null;
  maxPerWallet: number | null;
  paused: boolean;
  cancelled: boolean;
  banned: boolean;
  transferable: boolean | null;
  renewable: boolean | null;
  maxRedeems: number | null;
  randomAssignment: boolean;
  appCommissionBps: number | null;
  title: string | null;
  media: string | null;
  description: string | null;
  kind: string | null;
  /** Normalized discovery medium (`art` / `audio` / `video` / …). */
  mediumKind: string | null;
  /** `author/post/{id}` when the Drop was created from a post. */
  sourcePostPath: string | null;
  metadataTemplate: string | null;
  metadata: string | null;
  extraJson: string | null;
  royaltyJson: string | null;
  createdBlockHeight: number;
  createdBlockTimestamp: number;
  updatedBlockHeight: number;
  updatedBlockTimestamp: number;
}

const SCARCES_COLLECTION_CURRENT_FIELDS = `
  collectionId
  creatorId
  appId
  price
  allowlistPrice
  totalSupply
  mintedCount
  remaining
  startTime
  endTime
  createdAt
  mintMode
  maxPerWallet
  paused
  cancelled
  banned
  transferable
  renewable
  maxRedeems
  randomAssignment
  appCommissionBps
  title
  media
  description
  kind
  mediumKind
  sourcePostPath
  metadataTemplate
  metadata
  extraJson
  royaltyJson
  createdBlockHeight
  createdBlockTimestamp
  updatedBlockHeight
  updatedBlockTimestamp
`;

/** Current ownership row from live view `scarces_token_owners`. */
export interface ScarcesOwnedTokenRow {
  tokenId: string;
  ownerId: string | null;
  burned: boolean;
  collectionId: string | null;
  appId: string | null;
  mintedBlockTimestamp: number | null;
  updatedBlockTimestamp: number;
}

const SCARCES_OWNED_TOKEN_FIELDS = `
  tokenId
  ownerId
  burned
  collectionId
  appId
  mintedBlockTimestamp
  updatedBlockTimestamp
`;

/** Open offer row from sink-maintained `scarces_active_offers`. */
export interface ScarcesActiveOfferRow {
  offerKey: string;
  kind: 'token' | 'collection' | string;
  tokenId: string | null;
  collectionId: string | null;
  buyerId: string;
  /** Offer amount in yoctoNEAR. */
  amount: string;
  /** Nanoseconds, when set. */
  expiresAt: number | null;
  createdBlockHeight: number;
  createdBlockTimestamp: number;
  updatedBlockHeight: number;
  updatedBlockTimestamp: number;
}

const SCARCES_ACTIVE_OFFER_FIELDS = `
  offerKey
  kind
  tokenId
  collectionId
  buyerId
  amount
  expiresAt
  createdBlockHeight
  createdBlockTimestamp
  updatedBlockHeight
  updatedBlockTimestamp
`;

const SCARCES_EVENT_FIELDS = `
  eventType
  operation
  author
  blockHeight
  blockTimestamp
  tokenId
  collectionId
  listingId
  ownerId
  creatorId
  buyerId
  sellerId
  bidder
  accountId
  appId
  scarceContractId
  amount
  price
  oldPrice
  newPrice
  bidAmount
  marketplaceFee
  appPoolAmount
  creatorPayment
  quantity
  totalSupply
  redeemCount
  maxRedeems
  reservePrice
  buyNowPrice
  expiresAt
  reason
  memo
  extraData
`;

// ── Operation taxonomy ─────────────────────────────────────────────────────
// SSoT for scarces (eventType, operation) taxonomy lives in
// `./scarces-events.ts` and is guarded by `./scarces-events.parity.test.ts`.

import {
  SCARCES_EVENT_TYPES,
  SCARCE_OPERATIONS,
  COLLECTION_OPERATIONS,
  LAZY_LISTING_OPERATIONS,
  OFFER_OPERATIONS,
  APP_POOL_OPERATIONS,
  type ScarcesEventType,
} from './scarces-events.js';

// SCARCE_UPDATE family — `quick_mint` is the only mint op emitted on this
// family; collection-driven mints fire under COLLECTION_UPDATE (`creator_mint`,
// `purchase`).
const MINT_OPS = ['quick_mint'] as const;
const PURCHASE_OPS = ['purchase'] as const;
const LIST_OPS = ['list', 'list_native'] as const;
const DELIST_OPS = ['delist', 'delist_native', 'auto_delist'] as const;
const TRANSFER_OPS = ['transfer'] as const;
const BURN_OPS = ['burn'] as const;
// COLLECTION_UPDATE family
const COLLECTION_CREATE_OPS = ['create'] as const;
const COLLECTION_PURCHASE_OPS = ['purchase'] as const;
const COLLECTION_MINT_OPS = ['creator_mint'] as const;
// LAZY_LISTING_UPDATE family
const LAZY_CREATE_OPS = ['created'] as const;
const LAZY_PURCHASE_OPS = ['purchased'] as const;
// SCARCE_UPDATE auctions
const AUCTION_CREATE_OPS = ['auction_created'] as const;
const AUCTION_BID_OPS = ['auction_bid'] as const;
const AUCTION_SETTLE_OPS = ['auction_settled'] as const;
const ROYALTY_PAID_OPS = ['royalty_paid'] as const;
// OFFER_UPDATE family
const OFFER_MADE_OPS = ['offer_made'] as const;
const OFFER_ACCEPTED_OPS = ['offer_accepted'] as const;
// APP_POOL_UPDATE family
const APP_REGISTER_OPS = ['register'] as const;
const APP_FUND_OPS = ['fund'] as const;

export const SCARCES_OPERATIONS = {
  MINT: MINT_OPS,
  PURCHASE: PURCHASE_OPS,
  LIST: LIST_OPS,
  DELIST: DELIST_OPS,
  TRANSFER: TRANSFER_OPS,
  BURN: BURN_OPS,
  COLLECTION_CREATE: COLLECTION_CREATE_OPS,
  COLLECTION_PURCHASE: COLLECTION_PURCHASE_OPS,
  COLLECTION_MINT: COLLECTION_MINT_OPS,
  LAZY_CREATE: LAZY_CREATE_OPS,
  LAZY_PURCHASE: LAZY_PURCHASE_OPS,
  AUCTION_CREATE: AUCTION_CREATE_OPS,
  AUCTION_BID: AUCTION_BID_OPS,
  AUCTION_SETTLE: AUCTION_SETTLE_OPS,
  ROYALTY_PAID: ROYALTY_PAID_OPS,
  OFFER_MADE: OFFER_MADE_OPS,
  OFFER_ACCEPTED: OFFER_ACCEPTED_OPS,
  APP_REGISTER: APP_REGISTER_OPS,
  APP_FUND: APP_FUND_OPS,
  // Full per-family lists (every operation the contract emits) — handy for
  // building exhaustive feed queries via `events()`.
  ALL_SCARCE: SCARCE_OPERATIONS,
  ALL_COLLECTION: COLLECTION_OPERATIONS,
  ALL_LAZY_LISTING: LAZY_LISTING_OPERATIONS,
  ALL_OFFER: OFFER_OPERATIONS,
  ALL_APP_POOL: APP_POOL_OPERATIONS,
} as const;

export { SCARCES_EVENT_TYPES, type ScarcesEventType };

export class ScarcesQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Generic event filter — every other helper in this namespace is a thin
   * specialization of this. Filters are AND-ed together; pass arrays to
   * `eventType` / `operation` for `_in` matching.
   *
   * ```ts
   * await os.query.scarces.events({
   *   eventType: 'COLLECTION_UPDATE',
   *   operation: ['create', 'purchase'],
   *   limit: 25,
   * });
   * ```
   */
  async events(
    opts: {
      eventType?: string | readonly string[];
      operation?: string | readonly string[];
      tokenId?: string;
      collectionId?: string;
      listingId?: string;
      author?: string;
      ownerId?: string;
      buyerId?: string;
      sellerId?: string;
      /** Token / listing creator (payouts, royalties). */
      creatorId?: string;
      appId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ScarcesEventRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const wheres: string[] = [];
    const params: string[] = ['$limit: Int!', '$offset: Int!'];

    const addEq = (col: string, key: string, val: unknown, gqlType: string) => {
      wheres.push(`${col}: {_eq: $${key}}`);
      params.push(`$${key}: ${gqlType}`);
      variables[key] = val;
    };
    const addIn = (
      col: string,
      key: string,
      vals: readonly unknown[],
      gqlType: string
    ) => {
      wheres.push(`${col}: {_in: $${key}}`);
      params.push(`$${key}: [${gqlType}!]!`);
      variables[key] = vals;
    };

    if (opts.eventType !== undefined) {
      if (Array.isArray(opts.eventType)) {
        addIn('eventType', 'eventType', opts.eventType, 'String');
      } else {
        addEq('eventType', 'eventType', opts.eventType, 'String!');
      }
    }
    if (opts.operation !== undefined) {
      if (Array.isArray(opts.operation)) {
        addIn('operation', 'operation', opts.operation, 'String');
      } else {
        addEq('operation', 'operation', opts.operation, 'String!');
      }
    }
    if (opts.tokenId) addEq('tokenId', 'tokenId', opts.tokenId, 'String!');
    if (opts.collectionId)
      addEq('collectionId', 'collectionId', opts.collectionId, 'String!');
    if (opts.listingId)
      addEq('listingId', 'listingId', opts.listingId, 'String!');
    if (opts.author) addEq('author', 'author', opts.author, 'String!');
    if (opts.ownerId) addEq('ownerId', 'ownerId', opts.ownerId, 'String!');
    if (opts.buyerId) addEq('buyerId', 'buyerId', opts.buyerId, 'String!');
    if (opts.sellerId) addEq('sellerId', 'sellerId', opts.sellerId, 'String!');
    if (opts.creatorId)
      addEq('creatorId', 'creatorId', opts.creatorId, 'String!');
    if (opts.appId) addEq('appId', 'appId', opts.appId, 'String!');

    const whereClause = wheres.length ? `where: { ${wheres.join(', ')} },` : '';
    const res = await this._q.graphql<{
      scarcesEvents: ScarcesEventRow[];
    }>({
      query: `query ScarcesEvents(${params.join(', ')}) {
        scarcesEvents(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${SCARCES_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.scarcesEvents ?? [];
  }

  /**
   * Full event timeline for a single token, in chronological order
   * (mint → transfers → list/delist → burn …).
   *
   * ```ts
   * const history = await os.query.scarces.tokenHistory('s:42');
   * ```
   */
  async tokenHistory(
    tokenId: string,
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    const res = await this._q.graphql<{
      scarcesEvents: ScarcesEventRow[];
    }>({
      query: `query TokenHistory($tokenId: String!, $limit: Int!) {
        scarcesEvents(
          where: { tokenId: {_eq: $tokenId} },
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) { ${SCARCES_EVENT_FIELDS} }
      }`,
      variables: { tokenId, limit: opts.limit ?? 200 },
    });
    return res.data?.scarcesEvents ?? [];
  }

  /**
   * Every event for a collection (creation, purchases, mints-from, allowlist
   * changes, cancellation, refunds), newest first.
   *
   * ```ts
   * const activity = await os.query.scarces.collection('genesis');
   * ```
   */
  async collection(
    collectionId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    return this.events({
      collectionId,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  /**
   * Recent mints across the protocol, newest first. Includes `quick_mint`,
   * `mint`, and `mint_from_collection` operations.
   */
  async recentMints(opts: { limit?: number } = {}): Promise<ScarcesEventRow[]> {
    return this.events({
      eventType: SCARCES_EVENT_TYPES.SCARCE,
      operation: MINT_OPS,
      limit: opts.limit,
    });
  }

  /**
   * Mints authored by a specific creator, newest first.
   *
   * ```ts
   * const mine = await os.query.scarces.mintsBy('alice.near');
   * ```
   */
  async mintsBy(
    author: string,
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    return this.events({
      author,
      eventType: SCARCES_EVENT_TYPES.SCARCE,
      operation: MINT_OPS,
      limit: opts.limit,
    });
  }

  /**
   * Sales completed (`purchase` events on either native or external scarces),
   * optionally narrowed to a buyer or seller. Newest first.
   */
  async sales(
    opts: { buyerId?: string; sellerId?: string; limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    return this.events({
      eventType: SCARCES_EVENT_TYPES.SCARCE,
      operation: PURCHASE_OPS,
      buyerId: opts.buyerId,
      sellerId: opts.sellerId,
      limit: opts.limit,
    });
  }

  /**
   * Market recent sales — native `purchase` + `auction_settled` plus lazy
   * `purchased`, newest first. Prefer this for Market activity rails.
   */
  async recentSales(
    opts: { buyerId?: string; sellerId?: string; limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    const limit = opts.limit ?? 20;
    const shared = {
      buyerId: opts.buyerId,
      sellerId: opts.sellerId,
      limit,
    };
    const [native, lazy] = await Promise.all([
      this.events({
        ...shared,
        eventType: SCARCES_EVENT_TYPES.SCARCE,
        operation: [...PURCHASE_OPS, ...AUCTION_SETTLE_OPS],
      }),
      this.events({
        ...shared,
        eventType: SCARCES_EVENT_TYPES.LAZY_LISTING,
        operation: LAZY_PURCHASE_OPS,
      }),
    ]);
    return [...native, ...lazy]
      .sort((a, b) => b.blockTimestamp - a.blockTimestamp)
      .slice(0, limit);
  }

  /**
   * Last sales across the same event set as `scarces_collections_trade_stats`,
   * newest first. Reads `scarces_events` — not the lifetime volume rollup —
   * so a sale shows as soon as the sink writes it.
   */
  async recentCollectionSales(
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    const limit = opts.limit ?? 24;
    const [native, lazy, collection, offers] = await Promise.all([
      this.events({
        eventType: SCARCES_EVENT_TYPES.SCARCE,
        operation: [...PURCHASE_OPS, ...AUCTION_SETTLE_OPS],
        limit,
      }),
      this.events({
        eventType: SCARCES_EVENT_TYPES.LAZY_LISTING,
        operation: LAZY_PURCHASE_OPS,
        limit,
      }),
      this.events({
        eventType: SCARCES_EVENT_TYPES.COLLECTION,
        operation: COLLECTION_PURCHASE_OPS,
        limit,
      }),
      this.events({
        eventType: SCARCES_EVENT_TYPES.OFFER,
        operation: [...OFFER_ACCEPTED_OPS, 'collection_offer_accepted'],
        limit,
      }),
    ]);
    return [...native, ...lazy, ...collection, ...offers]
      .sort(
        (a, b) =>
          b.blockTimestamp - a.blockTimestamp || b.blockHeight - a.blockHeight
      )
      .slice(0, limit);
  }

  /**
   * Creator payout events — primary lazy/collection purchases plus secondary
   * `royalty_paid` rows where `creatorId` matches. Newest first. Prefer
   * `creatorPayment` on each row when summing earnings.
   */
  async creatorEarnings(
    creatorId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    return this.events({
      creatorId,
      operation: [
        ...LAZY_PURCHASE_OPS,
        ...COLLECTION_PURCHASE_OPS,
        ...ROYALTY_PAID_OPS,
      ],
      limit: opts.limit ?? 40,
      offset: opts.offset,
    });
  }

  /**
   * Bid history for a single token's auction, in chronological order.
   *
   * ```ts
   * const bids = await os.query.scarces.bids('s:42');
   * ```
   */
  async bids(
    tokenId: string,
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    const res = await this._q.graphql<{
      scarcesEvents: ScarcesEventRow[];
    }>({
      query: `query AuctionBids($tokenId: String!, $ops: [String!]!, $limit: Int!) {
        scarcesEvents(
          where: { tokenId: {_eq: $tokenId}, operation: {_in: $ops} },
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) { ${SCARCES_EVENT_FIELDS} }
      }`,
      variables: { tokenId, ops: AUCTION_BID_OPS, limit: opts.limit ?? 200 },
    });
    return res.data?.scarcesEvents ?? [];
  }

  /**
   * Live Market catalog (lazy + native + auction), newest listed first by
   * default. Backed by sink-maintained `scarces_active_listings` — not an
   * event log. Filtering / sorting / search all execute in the indexer so
   * pagination stays correct at any catalog size.
   *
   * ```ts
   * const live = await os.query.scarces.activeListings({ limit: 40 });
   * const cheapAuctions = await os.query.scarces.activeListings({
   *   kinds: ['auction'],
   *   orderBy: 'price_asc',
   * });
   * ```
   */
  async activeListings(
    opts: {
      limit?: number;
      offset?: number;
      /** Single-kind filter (kept for back-compat; prefer `kinds`). */
      kind?: 'lazy' | 'native' | 'auction' | string;
      /** Multi-kind filter, e.g. `['lazy', 'native']` for fixed-price. */
      kinds?: ('lazy' | 'native' | 'auction' | string)[];
      /** Native / auction rows for these token ids (`tokenId: {_in}`). */
      tokenIds?: string[];
      /** Only listings from this seller account. */
      sellerId?: string;
      /** Only listings published under this app / store slug. */
      appId?: string;
      /** Case-insensitive substring match on title / seller / creator. */
      search?: string;
      /**
       * Medium taxonomy from NEP-177 `extra.kind` (`art` | `audio` | …).
       * Indexer column `medium_kind` (legacy `music` normalized to `audio`).
       */
      mediumKind?: string;
      /** Discovery facet ids that must all appear in `facets` (Hasura `_contains`). */
      facets?: string[];
      /** Audio release format column (`single` | `album` | …). */
      audioFormat?: 'single' | 'album' | 'podcast' | string;
      /**
       * When true, omit primary post-mints (`kind=lazy` + `mediumKind=thought`).
       * Use for default Market All browse; leave off when filtering `mediumKind=thought`.
       */
      excludePrimaryThoughts?: boolean;
      /** Server-side sort; defaults to newest listed first. */
      orderBy?: 'listed_desc' | 'price_asc' | 'price_desc' | 'ending_asc';
    } = {}
  ): Promise<ScarcesActiveListingRow[]> {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const params = ['$limit: Int!', '$offset: Int!'];
    const where: string[] = [];

    if (opts.kind) {
      params.push('$kind: String!');
      variables.kind = opts.kind;
      where.push('kind: {_eq: $kind}');
    } else if (opts.kinds?.length) {
      params.push('$kinds: [String!]!');
      variables.kinds = opts.kinds;
      where.push('kind: {_in: $kinds}');
    }
    if (opts.tokenIds?.length) {
      params.push('$tokenIds: [String!]!');
      variables.tokenIds = opts.tokenIds;
      where.push('tokenId: {_in: $tokenIds}');
    }
    if (opts.sellerId) {
      params.push('$sellerId: String!');
      variables.sellerId = opts.sellerId;
      where.push('sellerId: {_eq: $sellerId}');
    }
    if (opts.appId) {
      params.push('$appId: String!');
      variables.appId = opts.appId;
      where.push('appId: {_eq: $appId}');
    }
    if (opts.search?.trim()) {
      params.push('$search: String!');
      variables.search = `%${opts.search.trim()}%`;
      where.push(
        '_or: [{title: {_ilike: $search}}, {sellerId: {_ilike: $search}}, {creatorId: {_ilike: $search}}]'
      );
    }
    const mediumKind = opts.mediumKind?.trim().toLowerCase();
    if (mediumKind) {
      // Sink normalizes legacy `music` → `audio` on write/backfill.
      params.push('$mediumKind: String!');
      variables.mediumKind = mediumKind === 'music' ? 'audio' : mediumKind;
      where.push('mediumKind: {_eq: $mediumKind}');
    }
    const facets = (opts.facets ?? [])
      .map((facet) => facet.trim().toLowerCase())
      .filter(Boolean);
    if (facets.length > 0) {
      params.push('$facets: [String!]!');
      variables.facets = facets;
      where.push('facets: {_contains: $facets}');
    }
    const audioFormat = opts.audioFormat?.trim().toLowerCase();
    if (audioFormat) {
      params.push('$audioFormat: String!');
      variables.audioFormat = audioFormat;
      where.push('audioFormat: {_eq: $audioFormat}');
    }
    if (opts.excludePrimaryThoughts) {
      // Keep thought *resales*; drop lazy thought post-mints from All browse.
      where.push(
        '_not: {_and: [{mediumKind: {_eq: "thought"}}, {kind: {_eq: "lazy"}}]}'
      );
    }

    const whereClause = where.length ? `where: { ${where.join(', ')} },` : '';
    // NULLS_LAST keeps unpriced / clockless rows from leading sorted pages.
    const orderClause =
      opts.orderBy === 'price_asc'
        ? '[{priceNumeric: ASC_NULLS_LAST}, {listedBlockTimestamp: DESC}]'
        : opts.orderBy === 'price_desc'
          ? '[{priceNumeric: DESC_NULLS_LAST}, {listedBlockTimestamp: DESC}]'
          : opts.orderBy === 'ending_asc'
            ? '[{expiresAt: ASC_NULLS_LAST}, {listedBlockTimestamp: DESC}]'
            : '[{listedBlockTimestamp: DESC}]';

    const res = await this._q.graphql<{
      scarcesActiveListings: ScarcesActiveListingRow[];
    }>({
      query: `query ScarcesActiveListings(${params.join(', ')}) {
        scarcesActiveListings(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: ${orderClause}
        ) { ${SCARCES_ACTIVE_LISTING_FIELDS} }
      }`,
      variables,
    });
    return res.data?.scarcesActiveListings ?? [];
  }

  /**
   * Live drop shell for one collection id. Backed by
   * `scarces_collections_current` — not the event log. Returns null when
   * missing or banned rows should be treated as unavailable by the caller.
   */
  async collectionCurrent(
    collectionId: string
  ): Promise<ScarcesCollectionCurrentRow | null> {
    const id = collectionId.trim();
    if (!id) return null;
    const res = await this._q.graphql<{
      scarcesCollectionsCurrent: ScarcesCollectionCurrentRow[];
    }>({
      query: `query ScarcesCollectionCurrent($collectionId: String!) {
        scarcesCollectionsCurrent(
          where: { collectionId: {_eq: $collectionId} },
          limit: 1
        ) { ${SCARCES_COLLECTION_CURRENT_FIELDS} }
      }`,
      variables: { collectionId: id },
    });
    return res.data?.scarcesCollectionsCurrent?.[0] ?? null;
  }

  /**
   * Live drop catalog (newest created first). Filter by creator / app / kind.
   *
   * ```ts
   * const drops = await os.query.scarces.collectionsCurrent({ creatorId: 'a.near' });
   * ```
   */
  async collectionsCurrent(
    opts: {
      limit?: number;
      offset?: number;
      creatorId?: string;
      appId?: string;
      /** Batch filter — preferred over repeated single-app calls. */
      appIds?: string[];
      kind?: string;
      /** Normalized medium filter (`art` / `audio` / `video` / …). */
      mediumKind?: string;
      /**
       * Case-insensitive title / creator search (`%needle%` on `title` +
       * `creatorId`). Same shape as `activeListings` search.
       */
      search?: string;
      /** Exact source post path (`author/post/{id}`). */
      sourcePostPath?: string;
      /** When false (default), hide paused/cancelled/banned shells. */
      includeUnavailable?: boolean;
      /**
       * `new` = newest created; `minting` / `volume` = most minted;
       * `live` / `upcoming` / `finished` align with `lifecycle` defaults.
       */
      orderBy?:
        | 'new'
        | 'minting'
        | 'volume'
        | 'live'
        | 'upcoming'
        | 'finished'
        | 'closing';
      /** When true, only rows with remaining supply (`remaining > 0`). */
      mintingOnly?: boolean;
      /**
       * Window + supply filter for Drops catalog tabs.
       * Requires `nowNs` (collection start/end are nanoseconds).
       * `closing` = live window ending within `closingNs` (defaults to now+24h when omitted).
       */
      lifecycle?: 'live' | 'upcoming' | 'finished' | 'closing';
      /** Nanoseconds; required when `lifecycle` is set. */
      nowNs?: number | string | bigint;
      /** Nanoseconds deadline for Closing (defaults to nowNs + 24h). */
      closingNs?: number | string | bigint;
    } = {}
  ): Promise<ScarcesCollectionCurrentRow[]> {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const params = ['$limit: Int!', '$offset: Int!'];
    const where: string[] = [];
    const lifecycle = opts.lifecycle;
    const effectiveOrder =
      opts.orderBy ??
      (lifecycle === 'upcoming'
        ? 'upcoming'
        : lifecycle === 'finished'
          ? 'finished'
          : lifecycle === 'closing'
            ? 'closing'
            : lifecycle === 'live'
              ? 'live'
              : 'new');

    if (!opts.includeUnavailable) {
      where.push('paused: {_eq: false}');
      where.push('cancelled: {_eq: false}');
      where.push('banned: {_eq: false}');
    }
    if (lifecycle) {
      if (opts.nowNs == null) {
        throw new Error('collectionsCurrent: nowNs is required with lifecycle');
      }
      params.push('$nowNs: bigint!');
      variables.nowNs = String(opts.nowNs);
      // Hasura BigintComparisonExp uses `_isNull` (camelCase), not `_is_null`.
      const liveWindow =
        '_and: [{_or: [{startTime: {_isNull: true}}, {startTime: {_lte: $nowNs}}]}, {_or: [{endTime: {_isNull: true}}, {endTime: {_eq: "0"}}, {endTime: {_gt: $nowNs}}]}]';
      if (lifecycle === 'live') {
        where.push('remaining: {_gt: 0}');
        where.push(liveWindow);
      } else if (lifecycle === 'closing') {
        const closingNs =
          opts.closingNs != null
            ? String(opts.closingNs)
            : String(
                BigInt(String(opts.nowNs)) + 24n * 60n * 60n * 1_000_000_000n
              );
        params.push('$closingNs: bigint!');
        variables.closingNs = closingNs;
        where.push('remaining: {_gt: 0}');
        where.push(
          '_and: [{_or: [{startTime: {_isNull: true}}, {startTime: {_lte: $nowNs}}]}, {endTime: {_gt: $nowNs}}, {endTime: {_neq: "0"}}, {endTime: {_lte: $closingNs}}]'
        );
      } else if (lifecycle === 'upcoming') {
        where.push('remaining: {_gt: 0}');
        where.push('startTime: {_gt: $nowNs}');
      } else {
        where.push(
          '_or: [{remaining: {_eq: 0}}, {_and: [{endTime: {_isNull: false}}, {endTime: {_neq: "0"}}, {endTime: {_lte: $nowNs}}]}]'
        );
      }
    } else if (opts.mintingOnly || opts.orderBy === 'minting') {
      where.push('remaining: {_gt: 0}');
    }
    if (opts.creatorId?.trim()) {
      params.push('$creatorId: String!');
      variables.creatorId = opts.creatorId.trim();
      where.push('creatorId: {_eq: $creatorId}');
    }
    const appIds = [
      ...new Set((opts.appIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (appIds.length > 0) {
      params.push('$appIds: [String!]!');
      variables.appIds = appIds;
      where.push('appId: {_in: $appIds}');
    } else if (opts.appId?.trim()) {
      params.push('$appId: String!');
      variables.appId = opts.appId.trim();
      where.push('appId: {_eq: $appId}');
    }
    if (opts.kind?.trim()) {
      params.push('$kind: String!');
      variables.kind = opts.kind.trim();
      where.push('kind: {_eq: $kind}');
    }
    const mediumKind = opts.mediumKind?.trim().toLowerCase();
    if (mediumKind) {
      params.push('$mediumKind: String!');
      variables.mediumKind = mediumKind === 'music' ? 'audio' : mediumKind;
      where.push('mediumKind: {_eq: $mediumKind}');
    }
    if (opts.search?.trim()) {
      params.push('$search: String!');
      variables.search = `%${opts.search.trim()}%`;
      where.push(
        '_or: [{title: {_ilike: $search}}, {creatorId: {_ilike: $search}}]'
      );
    }
    if (opts.sourcePostPath?.trim()) {
      params.push('$sourcePostPath: String!');
      variables.sourcePostPath = opts.sourcePostPath.trim();
      where.push('sourcePostPath: {_eq: $sourcePostPath}');
    }

    const whereClause = where.length ? `where: { ${where.join(', ')} },` : '';
    const orderClause =
      effectiveOrder === 'minting' || effectiveOrder === 'volume'
        ? '[{mintedCount: DESC_NULLS_LAST}, {remaining: ASC_NULLS_LAST}, {createdAt: DESC_NULLS_LAST}]'
        : effectiveOrder === 'upcoming'
          ? '[{startTime: ASC_NULLS_LAST}, {createdAt: DESC_NULLS_LAST}]'
          : effectiveOrder === 'finished'
            ? '[{updatedBlockTimestamp: DESC}, {createdAt: DESC_NULLS_LAST}]'
            : effectiveOrder === 'closing'
              ? '[{endTime: ASC_NULLS_LAST}, {remaining: ASC_NULLS_LAST}, {createdAt: DESC_NULLS_LAST}]'
              : '[{createdAt: DESC_NULLS_LAST}, {createdBlockTimestamp: DESC}]';
    const res = await this._q.graphql<{
      scarcesCollectionsCurrent: ScarcesCollectionCurrentRow[];
    }>({
      query: `query ScarcesCollectionsCurrent(${params.join(', ')}) {
        scarcesCollectionsCurrent(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: ${orderClause}
        ) { ${SCARCES_COLLECTION_CURRENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.scarcesCollectionsCurrent ?? [];
  }

  /**
   * Most-loved albums from `scarce_album_love_fans` (fan_count desc).
   */
  async albumLoveFans(opts: { limit?: number; offset?: number } = {}): Promise<
    Array<{
      postOwner: string;
      collectionId: string;
      fanCount: number;
      lastLoveBlock: number | null;
    }>
  > {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      scarceAlbumLoveFans: Array<{
        postOwner: string;
        collectionId: string;
        fanCount: number;
        lastLoveBlock: number | null;
      }>;
    }>({
      query: `query ScarceAlbumLoveFans($limit: Int!, $offset: Int!) {
        scarceAlbumLoveFans(
          limit: $limit,
          offset: $offset,
          orderBy: [{fanCount: DESC}, {lastLoveBlock: DESC_NULLS_LAST}]
        ) {
          postOwner
          collectionId
          fanCount
          lastLoveBlock
        }
      }`,
      variables: { limit, offset },
    });
    return res.data?.scarceAlbumLoveFans ?? [];
  }

  /**
   * Fan counts for specific drop ids (`scarce_album_love_fans`).
   * Missing ids simply omit a row — callers treat absence as 0 fans.
   */
  async albumLoveFansByCollectionIds(collectionIds: string[]): Promise<
    Array<{
      collectionId: string;
      fanCount: number;
    }>
  > {
    const ids = [
      ...new Set(
        collectionIds.map((id) => id.trim()).filter((id) => id.length > 0)
      ),
    ];
    if (ids.length === 0) return [];
    const res = await this._q.graphql<{
      scarceAlbumLoveFans: Array<{
        collectionId: string;
        fanCount: number;
      }>;
    }>({
      query: `query ScarceAlbumLoveFansByIds($ids: [String!]!) {
        scarceAlbumLoveFans(where: { collectionId: { _in: $ids } }) {
          collectionId
          fanCount
        }
      }`,
      variables: { ids },
    });
    return res.data?.scarceAlbumLoveFans ?? [];
  }

  /**
   * Top recent fan account ids + counts for drop ids
   * (`scarce_album_love_fan_ids`). Missing ids omit a row.
   */
  async albumLoveFanIdsByCollectionIds(collectionIds: string[]): Promise<
    Array<{
      collectionId: string;
      fanAccountIds: string[];
      fanCount: number;
    }>
  > {
    const ids = [
      ...new Set(
        collectionIds.map((id) => id.trim()).filter((id) => id.length > 0)
      ),
    ];
    if (ids.length === 0) return [];
    const res = await this._q.graphql<{
      scarceAlbumLoveFanIds: Array<{
        collectionId: string;
        fanAccountIds: string[] | null;
        fanCount: number;
      }>;
    }>({
      query: `query ScarceAlbumLoveFanIdsByIds($ids: [String!]!) {
        scarceAlbumLoveFanIds(where: { collectionId: { _in: $ids } }) {
          collectionId
          fanAccountIds
          fanCount
        }
      }`,
      variables: { ids },
    });
    return (res.data?.scarceAlbumLoveFanIds ?? []).map((row) => ({
      collectionId: row.collectionId,
      fanAccountIds: Array.isArray(row.fanAccountIds)
        ? row.fanAccountIds.filter(
            (id): id is string => typeof id === 'string' && id.trim().length > 0
          )
        : [],
      fanCount: Number(row.fanCount) || 0,
    }));
  }

  /**
   * Most-loved drops from `scarce_collection_love_fans` (fan_count desc).
   * Unions track loves + whole-Drop loves (distinct fans).
   */
  async collectionLoveFans(
    opts: { limit?: number; offset?: number } = {}
  ): Promise<
    Array<{
      postOwner: string;
      collectionId: string;
      fanCount: number;
      lastLoveBlock: number | null;
    }>
  > {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      scarceCollectionLoveFans: Array<{
        postOwner: string;
        collectionId: string;
        fanCount: number;
        lastLoveBlock: number | null;
      }>;
    }>({
      query: `query ScarceCollectionLoveFans($limit: Int!, $offset: Int!) {
        scarceCollectionLoveFans(
          limit: $limit,
          offset: $offset,
          orderBy: [{fanCount: DESC}, {lastLoveBlock: DESC_NULLS_LAST}]
        ) {
          postOwner
          collectionId
          fanCount
          lastLoveBlock
        }
      }`,
      variables: { limit, offset },
    });
    return res.data?.scarceCollectionLoveFans ?? [];
  }

  /**
   * Fan counts for specific drop ids (`scarce_collection_love_fans`).
   * Missing ids omit a row — callers treat absence as 0 fans.
   */
  async collectionLoveFansByCollectionIds(collectionIds: string[]): Promise<
    Array<{
      collectionId: string;
      fanCount: number;
    }>
  > {
    const ids = [
      ...new Set(
        collectionIds.map((id) => id.trim()).filter((id) => id.length > 0)
      ),
    ];
    if (ids.length === 0) return [];
    const res = await this._q.graphql<{
      scarceCollectionLoveFans: Array<{
        collectionId: string;
        fanCount: number;
      }>;
    }>({
      query: `query ScarceCollectionLoveFansByIds($ids: [String!]!) {
        scarceCollectionLoveFans(where: { collectionId: { _in: $ids } }) {
          collectionId
          fanCount
        }
      }`,
      variables: { ids },
    });
    return res.data?.scarceCollectionLoveFans ?? [];
  }

  /**
   * Most-traded drops from `scarces_collections_trade_stats`
   * (sales_volume desc, then last_sale_timestamp).
   * Same sale event set as hub `scarces_app_stats`.
   */
  async collectionTradeStats(
    opts: { limit?: number; offset?: number } = {}
  ): Promise<
    Array<{
      collectionId: string;
      appId: string | null;
      salesCount: number;
      salesVolume: string;
      lastSaleTimestamp: number | null;
    }>
  > {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      scarcesCollectionsTradeStats: Array<{
        collectionId: string;
        appId: string | null;
        salesCount: number;
        salesVolume: string | number;
        lastSaleTimestamp: number | null;
      }>;
    }>({
      query: `query ScarcesCollectionsTradeStats($limit: Int!, $offset: Int!) {
        scarcesCollectionsTradeStats(
          limit: $limit,
          offset: $offset,
          orderBy: [{salesVolume: DESC}, {lastSaleTimestamp: DESC_NULLS_LAST}]
        ) {
          collectionId
          appId
          salesCount
          salesVolume
          lastSaleTimestamp
        }
      }`,
      variables: { limit, offset },
    });
    return (res.data?.scarcesCollectionsTradeStats ?? []).map((row) => ({
      collectionId: row.collectionId,
      appId: row.appId,
      salesCount: Number(row.salesCount) || 0,
      salesVolume: String(row.salesVolume ?? '0'),
      lastSaleTimestamp: row.lastSaleTimestamp,
    }));
  }

  /**
   * Trade stats for specific drop ids (`scarces_collections_trade_stats`).
   * Missing ids omit a row — callers treat absence as 0 volume.
   */
  async collectionTradeStatsByCollectionIds(collectionIds: string[]): Promise<
    Array<{
      collectionId: string;
      appId: string | null;
      salesCount: number;
      salesVolume: string;
      lastSaleTimestamp: number | null;
    }>
  > {
    const ids = [
      ...new Set(
        collectionIds.map((id) => id.trim()).filter((id) => id.length > 0)
      ),
    ];
    if (ids.length === 0) return [];
    const res = await this._q.graphql<{
      scarcesCollectionsTradeStats: Array<{
        collectionId: string;
        appId: string | null;
        salesCount: number;
        salesVolume: string | number;
        lastSaleTimestamp: number | null;
      }>;
    }>({
      query: `query ScarcesCollectionsTradeStatsByIds($ids: [String!]!) {
        scarcesCollectionsTradeStats(where: { collectionId: { _in: $ids } }) {
          collectionId
          appId
          salesCount
          salesVolume
          lastSaleTimestamp
        }
      }`,
      variables: { ids },
    });
    return (res.data?.scarcesCollectionsTradeStats ?? []).map((row) => ({
      collectionId: row.collectionId,
      appId: row.appId,
      salesCount: Number(row.salesCount) || 0,
      salesVolume: String(row.salesVolume ?? '0'),
      lastSaleTimestamp: row.lastSaleTimestamp,
    }));
  }

  /**
   * Top recent fan account ids + counts for drop ids
   * (`scarce_collection_love_fan_ids`). Missing ids omit a row.
   */
  async collectionLoveFanIdsByCollectionIds(collectionIds: string[]): Promise<
    Array<{
      collectionId: string;
      fanAccountIds: string[];
      fanCount: number;
    }>
  > {
    const ids = [
      ...new Set(
        collectionIds.map((id) => id.trim()).filter((id) => id.length > 0)
      ),
    ];
    if (ids.length === 0) return [];
    const res = await this._q.graphql<{
      scarceCollectionLoveFanIds: Array<{
        collectionId: string;
        fanAccountIds: string[] | null;
        fanCount: number;
      }>;
    }>({
      query: `query ScarceCollectionLoveFanIdsByIds($ids: [String!]!) {
        scarceCollectionLoveFanIds(where: { collectionId: { _in: $ids } }) {
          collectionId
          fanAccountIds
          fanCount
        }
      }`,
      variables: { ids },
    });
    return (res.data?.scarceCollectionLoveFanIds ?? []).map((row) => ({
      collectionId: row.collectionId,
      fanAccountIds: Array.isArray(row.fanAccountIds)
        ? row.fanAccountIds.filter(
            (id): id is string => typeof id === 'string' && id.trim().length > 0
          )
        : [],
      fanCount: Number(row.fanCount) || 0,
    }));
  }

  /**
   * Creator / collector activity leaderboard (`scarces_activity`).
   */
  async activityLeaderboard(
    opts: {
      limit?: number;
      offset?: number;
      orderBy?: 'revenue' | 'created' | 'sold';
    } = {}
  ): Promise<
    Array<{
      accountId: string;
      itemsCreated: number;
      itemsSold: number;
      revenueEarned: string | null;
      collectionsCreated: number;
    }>
  > {
    const limit = opts.limit ?? 40;
    const offset = opts.offset ?? 0;
    const orderClause =
      opts.orderBy === 'created'
        ? '[{itemsCreated: DESC}, {collectionsCreated: DESC}]'
        : opts.orderBy === 'sold'
          ? '[{itemsSold: DESC}, {revenueEarned: DESC_NULLS_LAST}]'
          : '[{revenueEarned: DESC_NULLS_LAST}, {itemsSold: DESC}]';
    const res = await this._q.graphql<{
      scarcesActivity: Array<{
        accountId: string;
        itemsCreated: number;
        itemsSold: number;
        revenueEarned: string | null;
        collectionsCreated: number;
      }>;
    }>({
      query: `query ScarcesActivityLeaderboard($limit: Int!, $offset: Int!) {
        scarcesActivity(
          limit: $limit,
          offset: $offset,
          orderBy: ${orderClause}
        ) {
          accountId
          itemsCreated
          itemsSold
          revenueEarned
          collectionsCreated
        }
      }`,
      variables: { limit, offset },
    });
    return res.data?.scarcesActivity ?? [];
  }

  /**
   * Live drop shells for many collection ids (one Hasura round-trip).
   * Includes paused/cancelled/banned rows so vault enrich can still title
   * inventory the owner already holds.
   *
   * ```ts
   * const rows = await os.query.scarces.collectionsCurrentByIds(['drop-1', 'drop-2']);
   * ```
   */
  async collectionsCurrentByIds(
    collectionIds: string[]
  ): Promise<ScarcesCollectionCurrentRow[]> {
    const ids = Array.from(
      new Set(collectionIds.map((id) => id.trim()).filter(Boolean))
    );
    if (ids.length === 0) return [];

    const res = await this._q.graphql<{
      scarcesCollectionsCurrent: ScarcesCollectionCurrentRow[];
    }>({
      query: `query ScarcesCollectionsCurrentByIds($ids: [String!]!, $limit: Int!) {
        scarcesCollectionsCurrent(
          where: { collectionId: {_in: $ids} },
          limit: $limit
        ) { ${SCARCES_COLLECTION_CURRENT_FIELDS} }
      }`,
      variables: { ids, limit: ids.length },
    });
    return res.data?.scarcesCollectionsCurrent ?? [];
  }

  /**
   * Lazy listings created by a specific account, newest first.
   *
   * ```ts
   * const drops = await os.query.scarces.lazyListingsBy('alice.near');
   * ```
   */
  async lazyListingsBy(
    creatorId: string,
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    const res = await this._q.graphql<{
      scarcesEvents: ScarcesEventRow[];
    }>({
      query: `query LazyListingsBy($creatorId: String!, $eventType: String!, $ops: [String!]!, $limit: Int!) {
        scarcesEvents(
          where: {
            creatorId: {_eq: $creatorId},
            eventType: {_eq: $eventType},
            operation: {_in: $ops}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${SCARCES_EVENT_FIELDS} }
      }`,
      variables: {
        creatorId,
        eventType: SCARCES_EVENT_TYPES.LAZY_LISTING,
        ops: LAZY_CREATE_OPS,
        limit: opts.limit ?? 50,
      },
    });
    return res.data?.scarcesEvents ?? [];
  }

  /**
   * Open offers (live book), optionally filtered by token / buyer / kind.
   * Backed by sink-maintained `scarces_active_offers` — not an event log.
   * Callers should still filter expired `expiresAt` client-side.
   *
   * ```ts
   * const open = await os.query.scarces.activeOffers({ tokenId: 's:42' });
   * ```
   */
  async activeOffers(
    opts: {
      limit?: number;
      offset?: number;
      tokenId?: string;
      tokenIds?: string[];
      buyerId?: string;
      kind?: 'token' | 'collection' | string;
    } = {}
  ): Promise<ScarcesActiveOfferRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const where: string[] = [];
    const params = ['$limit: Int!', '$offset: Int!'];

    if (opts.tokenId) {
      params.push('$tokenId: String!');
      variables.tokenId = opts.tokenId;
      where.push('tokenId: {_eq: $tokenId}');
    } else if (opts.tokenIds?.length) {
      params.push('$tokenIds: [String!]!');
      variables.tokenIds = opts.tokenIds;
      where.push('tokenId: {_in: $tokenIds}');
    }
    if (opts.buyerId) {
      params.push('$buyerId: String!');
      variables.buyerId = opts.buyerId;
      where.push('buyerId: {_eq: $buyerId}');
    }
    if (opts.kind) {
      params.push('$kind: String!');
      variables.kind = opts.kind;
      where.push('kind: {_eq: $kind}');
    }

    const whereClause = where.length ? `where: { ${where.join(', ')} },` : '';

    const res = await this._q.graphql<{
      scarcesActiveOffers: ScarcesActiveOfferRow[];
    }>({
      query: `query ScarcesActiveOffers(${params.join(', ')}) {
        scarcesActiveOffers(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{updatedBlockTimestamp: DESC}]
        ) { ${SCARCES_ACTIVE_OFFER_FIELDS} }
      }`,
      variables,
    });
    return res.data?.scarcesActiveOffers ?? [];
  }

  /**
   * Historical `offer_made` events on a token (not the open book).
   * Prefer {@link activeOffers} for live open offers.
   *
   * ```ts
   * const history = await os.query.scarces.offersOn('s:42');
   * ```
   */
  async offersOn(
    tokenId: string,
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    return this.events({
      tokenId,
      eventType: SCARCES_EVENT_TYPES.OFFER,
      operation: OFFER_MADE_OPS,
      limit: opts.limit,
    });
  }

  /**
   * Activity feed for an app — register, fund, withdraw, ban/unban, etc.
   * Newest first.
   *
   * ```ts
   * const feed = await os.query.scarces.appActivity('my-app');
   * ```
   */
  async appActivity(
    appId: string,
    opts: { limit?: number } = {}
  ): Promise<ScarcesEventRow[]> {
    return this.events({
      appId,
      eventType: SCARCES_EVENT_TYPES.APP_POOL,
      limit: opts.limit,
    });
  }

  /**
   * Current unburned tokens owned by an account (newest updates first).
   * Backed by `scarces_token_owners` — prefer this over `nft_tokens_for_owner`
   * for vault browse; enrich media via `collectionCurrent` in the app.
   *
   * ```ts
   * const { items } = await os.query.scarces.ownedBy('alice.near', { limit: 24 });
   * ```
   */
  async ownedBy(
    ownerId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<{ items: ScarcesOwnedTokenRow[]; nextOffset?: number }> {
    const owner = ownerId.trim();
    if (!owner) return { items: [] };
    const limit = opts.limit ?? 24;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      scarcesTokenOwners: ScarcesOwnedTokenRow[];
    }>({
      query: `query ScarcesOwnedBy($ownerId: String!, $limit: Int!, $offset: Int!) {
        scarcesTokenOwners(
          where: {
            ownerId: {_eq: $ownerId},
            burned: {_eq: false}
          },
          limit: $limit,
          offset: $offset,
          orderBy: [{updatedBlockTimestamp: DESC}]
        ) { ${SCARCES_OWNED_TOKEN_FIELDS} }
      }`,
      variables: { ownerId: owner, limit, offset },
    });
    const items = res.data?.scarcesTokenOwners ?? [];
    return {
      items,
      nextOffset: items.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Current owner rows for token ids (`scarces_token_owners`).
   * Used to name a drop when a sale event has `tokenId` but no `collectionId`.
   */
  async tokensByIds(tokenIds: string[]): Promise<ScarcesOwnedTokenRow[]> {
    const ids = [
      ...new Set(tokenIds.map((id) => id.trim()).filter((id) => id.length > 0)),
    ];
    if (ids.length === 0) return [];
    const res = await this._q.graphql<{
      scarcesTokenOwners: ScarcesOwnedTokenRow[];
    }>({
      query: `query ScarcesTokensByIds($ids: [String!]!) {
        scarcesTokenOwners(where: { tokenId: { _in: $ids } }) {
          ${SCARCES_OWNED_TOKEN_FIELDS}
        }
      }`,
      variables: { ids },
    });
    return res.data?.scarcesTokenOwners ?? [];
  }
}
