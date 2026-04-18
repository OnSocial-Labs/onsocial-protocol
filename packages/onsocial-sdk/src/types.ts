// ---------------------------------------------------------------------------
// OnSocial SDK — shared types
// ---------------------------------------------------------------------------

/** NEAR network identifier. */
export type Network = 'mainnet' | 'testnet';

/** Gateway tier. */
export type Tier = 'free' | 'pro' | 'scale';

// ── SDK Configuration ──────────────────────────────────────────────────────

export interface OnSocialConfig {
  /** NEAR network (default: mainnet). */
  network?: Network;
  /** Gateway base URL override. Derived from network when omitted. */
  gatewayUrl?: string;
  /** API key for server-side usage (X-API-Key header). */
  apiKey?: string;
  /**
   * Actor ID for API-key auth — the end-user account that owns the data.
   *
   * When set, the SDK injects `actor_id` into every compose/relay POST body
   * so the gateway writes data under this account's namespace instead of the
   * API-key owner's. Only effective with API-key auth.
   */
  actorId?: string;
  /**
   * Default app namespace for notifications.
   *
   * When set, all notification calls use this appId unless overridden per-call.
   * Defaults to `'default'` if omitted.
   */
  appId?: string;
  /** Custom fetch implementation (default: globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  accountId: string;
  message: string;
  signature: string;
  publicKey: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: string;
  tier: Tier;
  rateLimit: number;
}

export interface AuthInfo {
  accountId: string;
  tier: Tier;
  rateLimit: number;
}

// ── Relay / Compose ─────────────────────────────────────────────────────────

export interface RelayResponse {
  txHash: string;
  [key: string]: unknown;
}

export interface PrepareResponse {
  action: Record<string, unknown>;
  target_account: string;
  [key: string]: unknown;
}

export interface UploadResult {
  cid: string;
  url: string;
  size: number;
  hash: string;
}

// ── Social ──────────────────────────────────────────────────────────────────

export interface EntryView {
  requested_key: string;
  full_key: string;
  value?: unknown;
  block_height?: string;
  deleted: boolean;
  corrupted: boolean;
}

export interface KeyEntry {
  key: string;
  block_height: string;
  value?: unknown;
}

export interface ListKeysOptions {
  prefix: string;
  fromKey?: string;
  limit?: number;
  withValues?: boolean;
}

export interface ProfileData {
  name?: string;
  bio?: string;
  /**
   * Profile avatar. Accepts a CID/URL string, OR a `File`/`Blob` which the
   * SDK uploads to IPFS via the gateway and replaces with `ipfs://<cid>`
   * before writing to the contract.
   */
  avatar?: string | Blob | File;
  links?: Record<string, string>;
  tags?: string[];
  [key: string]: unknown;
}

export interface PostData {
  text: string;
  media?: string[];
  /**
   * Optional file attachment. The SDK uploads it to IPFS via the gateway
   * and prepends `ipfs://<cid>` to `media[]` before writing the post.
   * Removed from the stored post body.
   */
  image?: Blob | File;
  tags?: string[];
  access?: 'public' | 'private' | 'group';
  [key: string]: unknown;
}

export interface ReactionData {
  type: string;
  [key: string]: unknown;
}

// ── Scarces (NFTs) ──────────────────────────────────────────────────────────

export interface MintOptions {
  title: string;
  description?: string;
  /** Optional file — uploaded by gateway (counts against tier quota). */
  image?: Blob | File;
  /** Pre-uploaded IPFS CID — bypasses gateway upload (BYO storage). */
  mediaCid?: string;
  /**
   * Optional NEP-177 `media_hash` (raw sha256 of the file bytes, base64).
   * Usually safe to omit when using `ipfs://` URLs since CIDs are already
   * content-addressed; provide only when targeting strict NEP-177 verifiers.
   */
  mediaHash?: string;
  copies?: number;
  collectionId?: string;
  royalty?: Record<string, number>;
  extra?: Record<string, unknown>;
  appId?: string;
  receiverId?: string;
}

export interface MintResponse extends RelayResponse {
  media?: UploadResult;
  metadata?: { cid: string; url: string; size: number };
}

export interface CollectionOptions {
  collectionId: string;
  totalSupply: number;
  title: string;
  /** Optional file — uploaded by gateway (counts against tier quota). */
  image?: Blob | File;
  /** Pre-uploaded IPFS CID — bypasses gateway upload (BYO storage). */
  mediaCid?: string;
  /**
   * Optional NEP-177 `media_hash` (raw sha256 of the file bytes, base64).
   * Usually safe to omit when using `ipfs://` URLs since CIDs are already
   * content-addressed; provide only when targeting strict NEP-177 verifiers.
   */
  mediaHash?: string;
  priceNear?: string;
  description?: string;
  royalty?: Record<string, number>;
  extra?: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
  appId?: string;
  mintMode?: string;
  maxPerWallet?: number;
  renewable?: boolean;
  transferable?: boolean;
  burnable?: boolean;
}

export interface ListingOptions {
  tokenId: string;
  priceNear: string;
  expiresAt?: string;
}

export interface AuctionOptions {
  tokenId: string;
  reservePriceNear: string;
  minBidIncrementNear: string;
  expiresAt?: string;
  buyNowPriceNear?: string;
}

export interface LazyListingOptions {
  title: string;
  priceNear: string;
  image?: Blob | File;
  mediaCid?: string;
  /**
   * Optional NEP-177 `media_hash` (raw sha256 of the file bytes, base64).
   * Usually safe to omit when using `ipfs://` URLs since CIDs are already
   * content-addressed; provide only when targeting strict NEP-177 verifiers.
   */
  mediaHash?: string;
  description?: string;
  royalty?: Record<string, number>;
  extra?: Record<string, unknown>;
  appId?: string;
  transferable?: boolean;
  burnable?: boolean;
  expiresAt?: string;
}

export interface OfferOptions {
  tokenId: string;
  amountNear: string;
  expiresAt?: string;
}

export interface CollectionOfferOptions {
  collectionId: string;
  amountNear: string;
  expiresAt?: string;
}

// ── Rewards ─────────────────────────────────────────────────────────────────

export interface CreditRequest {
  accountId: string;
  amount?: string;
  source?: string;
  appId?: string;
}

export interface CreditResponse extends RelayResponse {}

export interface ClaimResponse extends RelayResponse {
  claimed?: string;
}

export interface RewardBalance {
  claimable: string;
  totalEarned: string;
  totalClaimed: string;
  [key: string]: unknown;
}

// ── Query (GraphQL) ─────────────────────────────────────────────────────────

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; [key: string]: unknown }>;
}

export interface QueryLimits {
  tier: Tier;
  limits: {
    maxDepth: number;
    maxComplexity: number;
    maxRowLimit: number;
    allowAggregations: boolean;
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export interface StorageUploadResponse {
  cid: string;
  size: number;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  details?: string;
  tier?: Tier;
  limit?: number;
  retryAfter?: number;
}
