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
  avatar?: string;
  links?: Record<string, string>;
  tags?: string[];
  [key: string]: unknown;
}

export interface PostData {
  text: string;
  media?: string[];
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
  image?: Blob | File;
  mediaCid?: string;
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
  image?: Blob | File;
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
