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

// ── Groups ──────────────────────────────────────────────────────────────────

export interface GroupMemberData {
  role?: string;
  permissions?: number;
  joined_at?: string;
  [key: string]: unknown;
}

export interface GroupStats {
  member_count?: number;
  proposal_count?: number;
  [key: string]: unknown;
}

export interface JoinRequest {
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  requester_id: string;
  approved_at?: string;
  approved_by?: string;
  granted_permissions?: number;
  [key: string]: unknown;
}

// ── Governance ──────────────────────────────────────────────────────────────

export type ProposalStatus =
  | 'active'
  | 'executed'
  | 'executed_skipped'
  | 'rejected'
  | 'cancelled';

export interface VotingConfig {
  participation_quorum_bps: number;
  majority_threshold_bps: number;
  voting_period: string;
}

export interface Proposal {
  id: string;
  sequence_number: number;
  title: string;
  description: string;
  type: string;
  proposer: string;
  target?: string;
  data: Record<string, unknown>;
  created_at: string;
  status: ProposalStatus;
  voting_config: VotingConfig;
  locked_deposit?: string;
  [key: string]: unknown;
}

export interface ProposalTally {
  yes_votes: number;
  total_votes: number;
  created_at: string;
  locked_member_count: number;
}

export interface Vote {
  voter: string;
  approve: boolean;
  timestamp: string;
}

export interface ListProposalsOptions {
  fromSequence?: number;
  limit?: number;
}

// ── Permissions ─────────────────────────────────────────────────────────────

export type PermissionLevel = 0 | 1 | 2 | 3 | 4;

// ── On-chain Storage ────────────────────────────────────────────────────────

export interface AccountSharedStorage {
  max_bytes: number;
  used_bytes: number;
  pool_id: string;
}

export interface OnChainStorageBalance {
  balance: string;
  used_bytes: number;
  shared_storage?: AccountSharedStorage;
  group_pool_used_bytes: number;
  platform_pool_used_bytes: number;
  platform_sponsored: boolean;
  platform_first_write_ns?: number;
  platform_allowance: number;
  platform_last_refill_ns: number;
  locked_balance: string;
}

export interface PlatformPoolInfo {
  storage_balance: string;
  total_bytes: number;
  used_bytes: number;
  shared_bytes: number;
  available_bytes: number;
}

export interface PlatformAllowanceInfo {
  current_allowance: number;
  first_write_ns: number | null;
  is_platform_sponsored: boolean;
  config: {
    onboarding_bytes: number;
    daily_refill_bytes: number;
    max_allowance_bytes: number;
  };
}

// ── Contract Info ───────────────────────────────────────────────────────────

export type ContractStatus = 'Genesis' | 'Live' | 'ReadOnly';

export interface GovernanceConfig {
  max_key_length: number;
  max_path_depth: number;
  max_batch_size: number;
  max_value_bytes: number;
  platform_onboarding_bytes: number;
  platform_daily_refill_bytes: number;
  platform_allowance_max_bytes: number;
  intents_executors: string[];
}

export interface ContractInfo {
  manager: string;
  version: string;
  status: ContractStatus;
  config: GovernanceConfig;
}

// ── Pages ───────────────────────────────────────────────────────────────────

/** Sections that can appear on a user's page. */
export type PageSection =
  | 'profile'
  | 'links'
  | 'support'
  | 'posts'
  | 'events'
  | 'collectibles'
  | 'badges'
  | 'groups';

/** Theme customisation stored in `page/main`. */
export interface PageTheme {
  primary?: string;
  background?: string;
  text?: string;
  accent?: string;
}

/** Page configuration stored at `{account}/page/main`. */
export interface PageConfig {
  /** Template identifier — e.g. "minimal", "creator", "business". */
  template?: string;
  /** Color theme overrides. */
  theme?: PageTheme;
  /** Ordered list of visible sections. */
  sections?: PageSection[];
  /** Custom tagline (overrides bio on page). */
  tagline?: string;
  /** Custom CSS URL (premium feature). */
  customCss?: string;
}

/** Aggregated page data returned by the gateway `/data/page` endpoint. */
export interface PageData {
  accountId: string;
  profile: {
    name?: string;
    bio?: string;
    avatar?: string;
    links?: Array<{ label: string; url: string }>;
    tags?: string[];
  };
  config: PageConfig;
  stats: {
    standingCount?: number;
    postCount?: number;
    badgeCount?: number;
    groupCount?: number;
  };
  recentPosts?: Array<{
    id: string;
    text: string;
    createdAt: string;
  }>;
  badges?: Array<{
    name: string;
    value: unknown;
  }>;
}
