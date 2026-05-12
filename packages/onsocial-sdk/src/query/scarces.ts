// ---------------------------------------------------------------------------
// Scarces event queries (mints, sales, listings, auctions, offers, app pool).
// Accessed as `os.query.scarces.<method>()`.
//
// Backed by the `scarces_events` table populated by the scarces substreams
// indexer. Most columns are sparse — populated only for the relevant
// `eventType` / `operation` combinations — so consumers should branch on
// those when reading the result rows.
//
// For *current* on-chain state (a token's owner right now, a collection's
// remaining supply, an active listing's price), the canonical source is the
// scarces contract itself; this namespace returns historical events.
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
   * Offers placed on a single token, newest first.
   *
   * ```ts
   * const offers = await os.query.scarces.offersOn('s:42');
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
}
