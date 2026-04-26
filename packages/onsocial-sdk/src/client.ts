// ---------------------------------------------------------------------------
// OnSocial SDK — main client
// ---------------------------------------------------------------------------

import type {
  OnSocialConfig,
  MintOptions,
  MintResponse,
  RelayResponse,
} from './types.js';
import { HttpClient } from './http.js';
import { AuthModule } from './auth.js';
import { SocialModule, resolvePostMedia } from './social.js';
import { ScarcesModule } from './modules/scarces/index.js';
import { RewardsModule } from './rewards.js';
import { QueryModule } from './query/index.js';
import { StorageModule } from './storage.js';
import { EndorsementsModule } from './modules/endorsements.js';
import { AttestationsModule } from './modules/attestations.js';
import {
  resolveStorageProvider,
  type StorageConfig,
} from './storage/provider.js';
import { WebhooksModule } from './webhooks.js';
import { NotificationsModule } from './notifications.js';
import { GroupsModule } from './modules/groups.js';
import { PostsModule } from './modules/posts.js';
import { ProfilesModule } from './modules/profiles.js';
import { ReactionsModule } from './modules/reactions.js';
import { SavesModule } from './modules/saves.js';
import { PermissionsModule } from './permissions.js';
import { ChainModule } from './chain.js';
import { PagesModule } from './pages.js';
import { StandingsModule } from './modules/standings.js';
import { StorageAccountModule } from './modules/storage-account.js';
import type {
  ContentNamespace,
  EconomyNamespace,
  PlatformNamespace,
  RawNamespace,
} from './namespaces.js';

// ── Execute types ───────────────────────────────────────────────────────────

/** Any action object (internally-tagged: must have a `type` field). */
export interface ExecuteAction {
  type: string;
  [key: string]: unknown;
}

/** Options for `os.execute()`. */
export interface ExecuteOptions {
  /** Override target account (defaults to JWT identity). */
  targetAccount?: string;
  /** Contract-level options (e.g. refund_unused_deposit). */
  options?: Record<string, unknown>;
  /**
   * Wait for the on-chain receipt before resolving and throw if the
   * transaction reverted. When false (default) the relayer returns
   * `pending` after broadcast and the SDK never sees the on-chain outcome.
   *
   * Set to `true` for permission grants, governance writes, or any flow
   * where a silent on-chain revert would corrupt downstream state.
   */
  wait?: boolean;
}

/** Options for `os.mintPost()`. */
export interface MintPostOptions {
  /** Override NFT title (default: post text truncated to 100 chars). */
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

/** Signed-payload auth for `os.submit()`. */
export interface SignedAuth {
  type: 'signed_payload';
  public_key: string;
  nonce: string;
  expires_at_ms: string;
  signature: string;
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
 * `permissions`, `raw`. For one-off queries: `os.query.graphql<T>(...)`.
 *
 * Higher-level groupings (same instances): `os.content`, `os.economy`,
 * `os.platform`. Power-user composer for atomic batches: `os.advanced`.
 *
 * ## Common recipes
 *
 * ```ts
 * import { OnSocial, NEAR, PERMISSION } from '@onsocial/sdk';
 *
 * const os = new OnSocial({ network: 'mainnet' });
 *
 * // ── Auth ─────────────────────────────────────────────────────────────
 * await os.auth.login({ accountId, message, signature, publicKey });
 *
 * // ── Social writes (gasless via relayer) ──────────────────────────────
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
 * // ── Storage account (gasless tips/withdraws, signer-funded deposits) ─
 * const balance = await os.storageAccount.balance();
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
  /** Endorsements — weighted directed vouches with toggle + materialised lists. */
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
  /**
   * Storage account — best-in-class wrapper for on-chain Storage record
   * operations (balance reads, gasless writes via the relayer, and
   * deposit-funded writes via an optional signer).
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
   * Escape-hatch namespace for granular control — `execute`, `submit`,
   * raw NEAR Social KV, and the underlying HTTP client. Use when the
   * opinionated namespaces don't model what you need yet.
   *
   * ```ts
   * await os.raw.execute({ type: 'create_proposal', group_id: 'dao', … });
   * await os.raw.social.set('alice.near/mygame/score-42', { points: 9000 });
   * await os.raw.http.post('/relay/custom', payload);
   * ```
   */
  readonly raw: RawNamespace;

  /** The underlying HTTP client (for advanced usage). */
  readonly http: HttpClient;

  constructor(config: OnSocialConfig = {}) {
    this.http = new HttpClient(config);
    const storageProvider = resolveStorageProvider(
      config.storage as StorageConfig | undefined,
      this.http
    );
    this.auth = new AuthModule(this.http);
    this.social = new SocialModule(this.http, storageProvider);
    this.scarces = new ScarcesModule(this.http, this.social, storageProvider);
    this.rewards = new RewardsModule(this.http);
    this.query = new QueryModule(this.http);
    this.storage = new StorageModule(this.http, storageProvider);
    this.webhooks = new WebhooksModule(this.http, config.appId);
    this.notifications = new NotificationsModule(this.http, config.appId);
    this.groups = new GroupsModule(this.http, (p) =>
      resolvePostMedia(p, storageProvider)
    );
    this.permissions = new PermissionsModule(this.http);
    this.chain = new ChainModule(this.http);
    this.storageAccount = new StorageAccountModule(this.http, config.signer);
    this.pages = new PagesModule(this.http);
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
      submit: (action, opts) => this.submit(action, opts),
      social: this.social,
      http: this.http,
    };
  }

  // ── Generic execute ─────────────────────────────────────────────────────

  /**
   * Execute any action via the gateway relayer (intent auth — gasless).
   *
   * Works with every contract action: core (groups, governance, permissions),
   * scarces (all 50+ variants), and any future action types.
   *
   * ```ts
   * // Groups
   * await os.execute({ type: 'create_group', group_id: 'dao', config: {...} });
   *
   * // Governance
   * await os.execute({ type: 'create_proposal', group_id: 'dao', ... });
   *
   * // Any scarces action
   * await os.execute({ type: 'quick_mint', metadata: {...} });
   *
   * // With options
   * await os.execute(action, { targetAccount: 'other.near' });
   * ```
   */
  async execute(
    action: ExecuteAction,
    opts?: ExecuteOptions
  ): Promise<RelayResponse> {
    const path = opts?.wait ? '/relay/execute?wait=true' : '/relay/execute';
    return this.http.post<RelayResponse>(path, {
      action,
      ...(opts?.targetAccount && { target_account: opts.targetAccount }),
      ...(opts?.options && { options: opts.options }),
    });
  }

  /**
   * Submit a pre-signed action via the gateway relayer (signed-payload auth).
   *
   * Use this when you've built and signed the action client-side (e.g. via
   * `buildSigningPayload` + wallet signature from `@onsocial/sdk/advanced`).
   *
   * ```ts
   * import { buildPostAction, buildSigningPayload, buildSigningMessage }
   *   from '@onsocial/sdk/advanced';
   *
   * const action = buildPostAction({ text: 'gm' });
   * const payload = buildSigningPayload({ targetAccount, publicKey, nonce, expiresAtMs, action });
   * const message = buildSigningMessage(targetAccount, payload);
   * const signature = await wallet.signMessage(message);
   *
   * await os.submit(action, {
   *   targetAccount: 'alice.near',
   *   auth: {
   *     type: 'signed_payload',
   *     public_key: publicKey,
   *     nonce: String(nonce),
   *     expires_at_ms: String(expiresAtMs),
   *     signature,
   *   },
   * });
   * ```
   */
  async submit(
    action: ExecuteAction,
    opts: {
      targetAccount: string;
      auth: SignedAuth;
      options?: Record<string, unknown>;
    }
  ): Promise<RelayResponse> {
    return this.http.post<RelayResponse>('/relay/signed', {
      target_account: opts.targetAccount,
      action,
      auth: opts.auth,
      ...(opts.options && { options: opts.options }),
    });
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
    // Read the post content for NFT metadata
    const entry = await this.social.getOne(`post/${postId}`, postAuthor);
    let text = '';
    if (entry.value) {
      try {
        const parsed =
          typeof entry.value === 'string'
            ? JSON.parse(entry.value)
            : entry.value;
        text = parsed.text ?? '';
      } catch {
        text = String(entry.value);
      }
    }

    const title =
      opts.title ??
      ((text.length > 100 ? text.slice(0, 97) + '...' : text) ||
        `Post ${postId}`);
    const mintOpts: MintOptions = {
      title,
      description: opts.description ?? text,
      copies: opts.copies,
      royalty: opts.royalty,
      image: opts.image,
      mediaCid: opts.mediaCid,
      extra: {
        postAuthor,
        postId,
        postPath: `${postAuthor}/post/${postId}`,
        mintedAt: Date.now(),
      },
    };

    const mint = await this.scarces.tokens.mint(mintOpts);
    const result: MintPostResult = { mint };

    // Auto-list if price specified
    if (opts.priceNear && mint.txHash) {
      // txHash contains the token ID from the mint response
      result.listing = await this.scarces.market.sell({
        tokenId: mint.txHash,
        priceNear: opts.priceNear,
      });
    }

    return result;
  }
}
