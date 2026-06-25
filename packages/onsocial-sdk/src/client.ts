// ---------------------------------------------------------------------------
// OnSocial SDK — main client
// ---------------------------------------------------------------------------

import type { OnSocialConfig, MintResponse, RelayResponse } from './types.js';
import { HttpClient } from './internal/http.js';
import { AuthModule } from './internal/auth.js';
import { SocialModule, resolvePostMedia } from './modules/social.js';
import { ScarcesModule } from './modules/scarces/index.js';
import { RewardsModule } from './modules/rewards.js';
import { QueryModule } from './query/index.js';
import { SubscribeModule } from './modules/subscribe/index.js';
import { StorageModule } from './storage/module.js';
import { EndorsementsModule } from './modules/endorsements.js';
import { AttestationsModule } from './modules/attestations.js';
import {
  resolveStorageProvider,
  type StorageConfig,
} from './storage/provider.js';
import { WebhooksModule } from './modules/webhooks.js';
import { NotificationsModule } from './modules/notifications.js';
import { GroupsModule } from './modules/groups.js';
import { PostsModule } from './modules/posts.js';
import { ProfilesModule } from './modules/profiles.js';
import { ReactionsModule } from './modules/reactions.js';
import { SavesModule } from './modules/saves.js';
import { PermissionsModule } from './modules/permissions.js';
import { ChainModule } from './modules/chain.js';
import { TokenModule } from './modules/token.js';
import { BoostModule } from './modules/boost.js';
import { SocialSpendModule } from './modules/social-spend.js';
import { PagesModule } from './modules/pages.js';
import { StandingsModule } from './modules/standings.js';
import { StorageAccountModule } from './modules/storage-account.js';
import type { Session } from './advanced/session.js';
import { composeAndSign, signAndRelay } from './internal/session-bridge.js';
import { resolveContractId } from './internal/contracts.js';
import type {
  ContentNamespace,
  EconomyNamespace,
  PlatformNamespace,
  RawNamespace,
} from './internal/namespaces.js';

// ── Execute types ───────────────────────────────────────────────────────────

/** Any action object (internally-tagged: must have a `type` field). */
export interface ExecuteAction {
  type: string;
  [key: string]: unknown;
}

/** Options for `os.execute()`. */
export interface ExecuteOptions {
  /**
   * Override the inner `request.target_account` (namespace selector inside
   * the contract). Defaults to the session signer (the delegate sender).
   * Has no effect for non-core contracts.
   */
  targetAccount?: string;
  /**
   * Override the on-chain contract receiver (e.g. `core.onsocial.testnet`,
   * `scarces.onsocial.testnet`). Defaults to the resolved core contract
   * for the configured network.
   */
  targetContract?: string;
  /** Contract-level options (e.g. `refund_unused_deposit`). */
  options?: Record<string, unknown>;
  /**
   * Inner FunctionCall attached deposit in yoctoNEAR. Gateway relay only
   * supports 0 or 1 yoctoNEAR; use wallet broadcast for larger value deposits.
   */
  depositYocto?: bigint | string;
  /**
   * Wait for the on-chain receipt and throw `RelayExecutionError` on revert.
   * Use for permission grants, governance writes, or any flow where a silent
   * on-chain revert would corrupt downstream state.
   */
  wait?: boolean;
  /**
   * Override the broadcast target for this call. Defaults to
   * `OnSocialConfig.defaultBroadcast` (which itself defaults to `'gateway'`).
   * See `BroadcastTarget` in `./types.js`.
   */
  broadcast?: import('./types.js').BroadcastTarget;
}

/** Options for `os.mintPost()`. */
export interface MintPostOptions {
  /** Override NFT title (default: concise title derived from the post text). */
  title?: string;
  /** Override NFT description. */
  description?: string;
  /** Optional image to attach to the scarce. */
  image?: Blob | File;
  /** Pre-uploaded IPFS CID for the media. */
  mediaCid?: string;
  /** Number of editions (default: 1). */
  copies?: number;
  /** Royalty map — e.g. `{ 'alice.near': 1000 }` for 10%. */
  royalty?: Record<string, number>;
  /** Fixed sale price in NEAR. If set, the scarce is listed immediately. */
  priceNear?: string;
}

/** Result of `os.mintPost()`. */
export interface MintPostResult {
  mint: MintResponse;
  /** Present only when `priceNear` was set. */
  listing?: RelayResponse;
}

function findMintedTokenId(value: unknown, depth = 0): string | undefined {
  if (depth > 4 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMintedTokenId(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const direct = record.tokenId ?? record.token_id;
  if (typeof direct === 'string' && direct) return direct;

  for (const nested of Object.values(record)) {
    const found = findMintedTokenId(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * OnSocial Protocol SDK.
 *
 * Thin gateway-first client — every operation is a single HTTP call.
 * Zero blockchain knowledge required.
 *
 * ## Namespaces at a glance
 *
 * | Namespace             | Purpose                                                      |
 * | --------------------- | ------------------------------------------------------------ |
 * | `os.auth`             | Login, refresh, logout                                       |
 * | `os.social`           | Atomic `Action::Set` writes + raw `getOne`/`getMany` reads   |
 * | `os.posts`            | Blessed single entry point for post creation                 |
 * | `os.profiles`         | Read/write profiles + auto media upload                      |
 * | `os.reactions`        | Add / remove / toggle / summary                              |
 * | `os.saves`            | Bookmarks (add / remove / toggle / list)                     |
 * | `os.endorsements`     | Weighted directed vouches                                    |
 * | `os.attestations`     | Verifiable typed claims                                      |
 * | `os.standings`        | "Stand with" account graph                                   |
 * | `os.groups`           | Lifecycle, membership, governance, group content             |
 * | `os.permissions`      | Account- + key-scoped permissions (incl. `grantOrPropose`)   |
 * | `os.storageAccount`   | On-chain Storage record (balance, tip, withdraw, sponsor)    |
 * | `os.scarces`          | NFTs (mint, collections, market, offers)                     |
 * | `os.rewards`          | Credit / claim / balance                                     |
 * | `os.socialSpend`      | SOCIAL spend + season/target claim transaction helpers       |
 * | `os.storage`          | IPFS file/JSON upload                                        |
 * | `os.pages`            | onsocial.id page configuration                               |
 * | `os.chain`            | On-chain storage + contract introspection                    |
 * | `os.webhooks`         | Webhook endpoints (pro+)                                     |
 * | `os.notifications`    | Notifications (pro+)                                         |
 * | `os.query`            | Typed GraphQL helpers over indexed data (see below)          |
 *
 * `os.query` sub-namespaces:
 * `feed`, `threads`, `groups`, `profiles`, `reactions`, `standings`,
 * `saves`, `endorsements`, `attestations`, `hashtags`, `stats`, `storage`,
 * `permissions`, `governance`, `raw`. For one-off queries:
 * `os.query.graphql<T>(...)`.
 *
 * Higher-level groupings (same instances): `os.content`, `os.economy`,
 * `os.platform`. Power-user composer for atomic batches: `os.advanced`.
 *
 * ## Common recipes
 *
 * ```ts
 * import { OnSocial, NEAR, PERMISSION } from '@onsocial/sdk';
 *
 * const os = new OnSocial({
 *   network: 'mainnet',
 *   apiKey: process.env.ONSOCIAL_API_KEY!,
 *   actorId,
 * });
 * os.attachSession(session);
 *
 * // ── Auth ─────────────────────────────────────────────────────────────
 * await os.auth.login({ accountId, message, signature, publicKey });
 *
 * // ── Social writes (session-signed via gateway delegate relay) ────────
 * await os.profiles.set({ name: 'Alice', bio: 'Builder' });
 * await os.posts.create({ text: 'Hello OnSocial!' });
 * await os.standings.standWith('bob.near');
 * await os.reactions.toggle('bob.near', '123', 'like');
 * await os.saves.toggle('bob.near/post/123');
 *
 * // ── Scarces (NFTs) ───────────────────────────────────────────────────
 * await os.scarces.tokens.mint({ title: 'My Art', image: file });
 * await os.scarces.market.sell({ tokenId: '1', priceNear: '5' });
 *
 * // ── Groups & Governance ──────────────────────────────────────────────
 * await os.groups.create('dao', { v: 1, name: 'DAO', isPrivate: true, memberDriven: true });
 * await os.groups.join('dao');
 * await os.groups.propose('dao', 'CustomProposal', { title: '...', ... });
 * await os.groups.vote('dao', proposalId, true);
 *
 * // ── Permissions (auto-routes to governance for member-driven groups) ─
 * await os.permissions.grant('bob.near', 'profile/', PERMISSION.WRITE);
 * await os.permissions.revoke('bob.near', 'profile/');
 * await os.permissions.grantOrPropose('bob.near', 'groups/dao/content/', 1, {
 *   reason: 'Promote to writer',
 * });
 * const canWrite = await os.permissions.has(owner, grantee, 'profile/', 1);
 *
 * // ── Storage account (reads + wallet-signed storage admin writes) ─────
 * const balance = await os.storageAccount.balance();
 * // Requires defaultBroadcast: { kind: 'wallet', signer } on the client.
 * await os.storageAccount.tip('bob.near', NEAR('0.001'));
 * await os.storageAccount.withdraw(NEAR('0.05'));
 * await os.storageAccount.sponsor('bob.near', { maxBytes: 4096 });
 * try {
 *   await os.storageAccount.deposit(NEAR('0.1')); // requires signer
 * } catch (e) {
 *   if (e instanceof SignerRequiredError) wallet.signAndSend(e.payload);
 * }
 *
 * // ── Rewards ──────────────────────────────────────────────────────────
 * await os.rewards.credit({ accountId: 'alice.near', amount: '1000000' });
 *
 * // ── Indexed reads (GraphQL) ──────────────────────────────────────────
 * const feed = await os.query.feed.recent({ author: 'alice.near' });
 * const tipsIn = await os.query.storage.tipsReceived('alice.near');
 * const audit = await os.query.permissions.forPath('alice.near/profile/');
 * const issued = await os.query.permissions.grantsBy('alice.near');
 * const proposals = await os.query.governance.proposals('dao', { limit: 20 });
 * const votes = await os.query.governance.votes('dao', proposalId);
 *
 * // ── IPFS ─────────────────────────────────────────────────────────────
 * const { cid } = await os.storage.upload(file);
 *
 * // ── Power user: any action directly ──────────────────────────────────
 * await os.execute({ type: 'create_group', group_id: 'dao', config: {...} });
 * ```
 */
export class OnSocial {
  /** Authentication (login, refresh, logout). */
  readonly auth: AuthModule;
  /** Social graph (profiles, posts, standings, reactions, saves, endorsements, attestations). */
  readonly social: SocialModule;
  /** Posts — the blessed single entry point for post creation. */
  readonly posts: PostsModule;
  /** Profiles — read/write profiles with auto-uploaded avatar / banner and materialised reads. */
  readonly profiles: ProfilesModule;
  /** Reactions — add / remove / toggle / summary helpers over indexed reaction state. */
  readonly reactions: ReactionsModule;
  /** Saves — add / remove / toggle / list bookmarks; accepts post objects directly. */
  readonly saves: SavesModule;
  /** Endorsements — directed contextual vouches with toggle + materialised lists. */
  readonly endorsements: EndorsementsModule;
  /** Attestations — verifiable typed claims with auto-claimId issue + lists. */
  readonly attestations: AttestationsModule;
  /** Standings — account ↔ account "stand with" graph. */
  readonly standings: StandingsModule;
  /** Scarces / NFTs (mint, collections, marketplace, offers). */
  readonly scarces: ScarcesModule;
  /** Rewards (credit, claim, balance). */
  readonly rewards: RewardsModule;
  /** Query indexed data via GraphQL. */
  readonly query: QueryModule;
  /** Polling subscriptions over indexed data (live feeds). */
  readonly subscribe: SubscribeModule;
  /** IPFS storage (upload files and JSON). */
  readonly storage: StorageModule;
  /** Webhook endpoints (pro tier+). */
  readonly webhooks: WebhooksModule;
  /** Notifications (list, count, mark-read, send events, rules). Pro tier+. */
  readonly notifications: NotificationsModule;
  /** Groups — lifecycle, membership, governance, and group content. */
  readonly groups: GroupsModule;
  /** Permissions — account-level and key-level permission management. */
  readonly permissions: PermissionsModule;
  /** Chain — on-chain storage management and contract introspection. */
  readonly chain: ChainModule;
  /** Token — SOCIAL fungible-token (NEP-141) view reads. */
  readonly token: TokenModule;
  /** Boost — boost contract view reads (account, lock status, reward rate). */
  readonly boost: BoostModule;
  /** Social Spend — SOCIAL spend and claim transaction helpers. */
  readonly socialSpend: SocialSpendModule;
  /**
   * Storage account — best-in-class wrapper for on-chain Storage record
   * operations (balance reads plus wallet-signed `execute_admin` writes).
   */
  readonly storageAccount: StorageAccountModule;
  /** Pages — configure and read onsocial.id page data. */
  readonly pages: PagesModule;

  /**
   * Grouped namespace for user-generated content modules. Same instances
   * as the top-level `os.profiles`, `os.posts`, … properties — just
   * re-organised under one mental bucket for discoverability.
   *
   * ```ts
   * await os.content.posts.create({ text: 'gm' });
   * await os.content.reactions.toggle(post, 'like');
   * const feed = await os.content.feed.getFeed({ accountId });
   * ```
   */
  readonly content: ContentNamespace;
  /**
   * Grouped namespace for value-flow modules (Scarces + rewards).
   *
   * ```ts
   * await os.economy.scarces.tokens.mint({ title: 'Art', image: file });
   * await os.economy.rewards.claim(claimId);
   * ```
   */
  readonly economy: EconomyNamespace;
  /**
   * Grouped namespace for dev-platform concerns (storage, permissions,
   * notifications, webhooks, pages).
   *
   * ```ts
   * const { cid } = await os.platform.storage.upload(file);
   * await os.platform.notifications.list();
   * ```
   */
  readonly platform: PlatformNamespace;
  /**
   * Escape-hatch namespace for granular control — `execute`, raw OnSocial KV,
   * and the underlying HTTP client. Use when the
   * opinionated namespaces don't model what you need yet.
   *
   * ```ts
   * await os.raw.execute({ type: 'create_proposal', group_id: 'dao', … });
   * await os.raw.social.set('alice.near/mygame/score-42', { points: 9000 });
   * await os.raw.http.post('/data/custom', payload);
   * ```
   */
  readonly raw: RawNamespace;

  /** The underlying HTTP client (for advanced usage). */
  readonly http: HttpClient;

  /**
   * The currently attached session, or `null`. Set via `attachSession()`.
   *
   * SDK write methods that use the compose prepare→sign→relay flow require
   * an attached session and will throw `SessionRequiredError` otherwise.
   */
  private _session: Session | null = null;

  /** Advanced broadcast override. Unset means canonical gateway delegate path. */
  private readonly _defaultBroadcast?: import('./types.js').BroadcastTarget;

  /** Optional injected finality block-height provider (for self-hosted setups with no gateway). */
  private readonly _latestBlockHeightProvider?: () => Promise<
    bigint | number | string
  >;

  private readonly _accessKeyNonceProvider?: (
    accountId: string,
    publicKey: string
  ) => Promise<number>;

  /**
   * Attach a session key for subsequent gateway-relayed writes. Once attached,
   * every normal SDK write signs a NEP-366 delegate with this session and posts
   * it to the gateway's `/relay/delegate` endpoint.
   *
   * Apps should call this after the user has granted the on-chain session
   * key (see `buildSessionGrant` in `@onsocial/sdk/advanced`).
   */
  attachSession(session: Session): void {
    this._session = session;
  }

  /** Remove the attached session. Subsequent writes will throw. */
  detachSession(): void {
    this._session = null;
  }

  /** Currently attached session, or `null`. */
  get session(): Session | null {
    return this._session;
  }

  /**
   * Internal: prepare→sign→relay pipeline for compose verbs. Called by SDK
   * module methods that build actions through the gateway before signing.
   *
   * Uses the canonical gateway delegate path unless an advanced broadcast
   * override explicitly routes to a self-hosted relayer or wallet-paid flow.
   *
   * Throws `SessionRequiredError` if no session is attached AND broadcast
   * is not `{ kind: 'wallet' }`.
   */
  _composeAndSign(
    verb: string,
    body: unknown,
    methodLabel?: string
  ): Promise<RelayResponse> {
    const broadcast = this._defaultBroadcast;
    return composeAndSign(
      this.http,
      this._session,
      verb,
      body,
      methodLabel,
      this._delegateRelayOpts(broadcast)
    );
  }

  private _delegateRelayOpts(
    broadcast?: import('./types.js').BroadcastTarget
  ): {
    broadcast?: import('./types.js').BroadcastTarget;
    network: import('./types.js').Network;
    latestBlockHeightProvider?: () => Promise<bigint | number | string>;
    accessKeyNonceProvider?: (
      accountId: string,
      publicKey: string
    ) => Promise<number>;
  } {
    return {
      ...(broadcast !== undefined ? { broadcast } : {}),
      network: this.http.network,
      ...(this._latestBlockHeightProvider !== undefined && {
        latestBlockHeightProvider: this._latestBlockHeightProvider,
      }),
      ...(this._accessKeyNonceProvider !== undefined && {
        accessKeyNonceProvider: this._accessKeyNonceProvider,
      }),
    };
  }

  constructor(config: OnSocialConfig = {}) {
    this.http = new HttpClient(config);
    this._defaultBroadcast = config.defaultBroadcast;
    this._latestBlockHeightProvider = config.latestBlockHeightProvider;
    this._accessKeyNonceProvider = config.accessKeyNonceProvider;
    const storageProvider = resolveStorageProvider(
      config.storage as StorageConfig | undefined,
      this.http
    );
    const getBroadcast = () => this._defaultBroadcast;
    this.auth = new AuthModule(this.http);
    this.social = new SocialModule(
      this.http,
      () => this._session,
      storageProvider,
      getBroadcast
    );
    this.query = new QueryModule(this.http);
    this.subscribe = new SubscribeModule(this.query);
    this.scarces = new ScarcesModule(
      this.http,
      () => this._session,
      this.social,
      storageProvider,
      getBroadcast,
      this.query
    );
    this.rewards = new RewardsModule(this.http);
    this.storage = new StorageModule(this.http, storageProvider);
    this.webhooks = new WebhooksModule(this.http, config.appId);
    this.notifications = new NotificationsModule(this.http, config.appId);
    this.groups = new GroupsModule(
      this.http,
      () => this._session,
      (p) => resolvePostMedia(p, storageProvider),
      getBroadcast
    );
    this.permissions = new PermissionsModule(
      this.http,
      () => this._session,
      getBroadcast
    );
    this.chain = new ChainModule(this.http);
    this.token = new TokenModule(this.http);
    this.boost = new BoostModule(this.http);
    this.socialSpend = new SocialSpendModule(this.http, getBroadcast);
    this.storageAccount = new StorageAccountModule(
      this.http,
      () => this._session,
      config.signer,
      getBroadcast
    );
    this.pages = new PagesModule(
      this.http,
      this.query,
      () => this._session,
      getBroadcast
    );
    this.posts = new PostsModule(this.social, this.groups);
    this.profiles = new ProfilesModule(
      this.social,
      this.query,
      storageProvider
    );
    this.reactions = new ReactionsModule(this.social, this.query);
    this.saves = new SavesModule(this.social, this.query);
    this.endorsements = new EndorsementsModule(this.social, this.query);
    this.attestations = new AttestationsModule(this.social, this.query);
    this.standings = new StandingsModule(this.social, this.query);

    // Grouped namespaces — same instances, organised for discoverability.
    this.content = {
      profiles: this.profiles,
      posts: this.posts,
      reactions: this.reactions,
      saves: this.saves,
      endorsements: this.endorsements,
      attestations: this.attestations,
      standings: this.standings,
      feed: this.query,
    };
    this.economy = {
      scarces: this.scarces,
      rewards: this.rewards,
      token: this.token,
      boost: this.boost,
      socialSpend: this.socialSpend,
    };
    this.platform = {
      storage: this.storage,
      permissions: this.permissions,
      notifications: this.notifications,
      webhooks: this.webhooks,
      pages: this.pages,
    };
    this.raw = {
      execute: (action, opts) => this.execute(action, opts),
      social: this.social,
      http: this.http,
    };
  }

  // ── Generic execute ─────────────────────────────────────────────────────

  /**
   * Execute any action through the canonical gateway delegate path
   * (NEP-366 SignedDelegateAction). Requires an attached session
   * (`os.attachSession(...)`).
   *
   * Works with every contract action: core (groups, governance, permissions),
   * scarces (all 50+ variants), and any future action types.
   *
   * ```ts
   * // Defaults to the resolved core contract for the network.
   * await os.execute({ type: 'create_group', group_id: 'dao', config: {...} });
   *
   * // Send to a different contract (e.g. scarces).
   * await os.execute(
   *   { type: 'quick_mint', metadata: {...} },
   *   { targetContract: 'scarces.onsocial.testnet' }
   * );
   *
   * // Wait for finality so on-chain reverts surface as RelayExecutionError.
   * await os.execute(action, { wait: true });
   * ```
   */
  async execute(
    action: ExecuteAction,
    opts?: ExecuteOptions
  ): Promise<RelayResponse> {
    const targetContract =
      opts?.targetContract ?? resolveContractId(this.http.network, 'core');
    const broadcast = opts?.broadcast ?? this._defaultBroadcast;
    return signAndRelay(
      this.http,
      this._session,
      action,
      targetContract,
      `execute(${action.type})`,
      {
        ...(opts?.targetAccount !== undefined && {
          targetAccount: opts.targetAccount,
        }),
        ...(opts?.options !== undefined && { requestOptions: opts.options }),
        ...(opts?.depositYocto !== undefined && {
          depositYocto: opts.depositYocto,
        }),
        ...(opts?.wait !== undefined && { wait: opts.wait }),
        ...this._delegateRelayOpts(broadcast),
      }
    );
  }

  // ── Social commerce ─────────────────────────────────────────────────────

  /**
   * Mint a post as a collectible scarce (NFT) and optionally list it for sale.
   *
   * Reads the post, mints it with post metadata linked in `extra`, and
   * optionally lists it at a fixed price — all in one call.
   *
   * ```ts
   * // Mint a post as 1-of-1 collectible
   * const { mint } = await os.mintPost('alice.near', '1713456789');
   *
   * // Mint + list for sale in one step
   * const { mint, listing } = await os.mintPost('alice.near', '1713456789', {
   *   priceNear: '5',
   *   royalty: { 'alice.near': 1000 },  // 10% on resales
   *   copies: 10,
   * });
   * ```
   */
  async mintPost(
    postAuthor: string,
    postId: string,
    opts: MintPostOptions = {}
  ): Promise<MintPostResult> {
    const { priceNear, ...mintOpts } = opts;
    const mint = await this.scarces.fromPost.mint(
      { author: postAuthor, postId },
      mintOpts
    );
    const result: MintPostResult = { mint };

    if (priceNear) {
      const tokenId = findMintedTokenId(mint);
      if (!tokenId) {
        throw new Error(
          'os.mintPost(..., { priceNear }) could not determine the minted token id from the relay response; mint first, then list with os.scarces.market.sell({ tokenId, priceNear }).'
        );
      }
      result.listing = await this.scarces.market.sell({
        tokenId,
        priceNear,
      });
    }

    return result;
  }
}
