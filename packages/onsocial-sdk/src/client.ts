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
import { SocialModule } from './social.js';
import { ScarcesModule } from './scarces.js';
import { RewardsModule } from './rewards.js';
import { QueryModule } from './query.js';
import { StorageModule } from './storage.js';
import { WebhooksModule } from './webhooks.js';
import { NotificationsModule } from './notifications.js';
import { GroupsModule } from './groups.js';
import { PermissionsModule } from './permissions.js';
import { ChainModule } from './chain.js';
import { PagesModule } from './pages.js';

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
 * ```ts
 * import { OnSocial } from '@onsocial/sdk';
 *
 * const os = new OnSocial({ network: 'mainnet' });
 *
 * // Login with NEAR signature
 * await os.auth.login({ accountId, message, signature, publicKey });
 *
 * // Social
 * await os.social.setProfile({ name: 'Alice', bio: 'Builder' });
 * await os.social.post({ text: 'Hello OnSocial!' });
 * await os.social.standWith('bob.near');
 * await os.social.reply('bob.near', '123', { text: 'Great post!' });
 * await os.social.save('bob.near/post/123');
 * await os.social.endorse('bob.near', { topic: 'rust' });
 *
 * // Scarces (NFTs)
 * await os.scarces.mint({ title: 'My Art', image: file });
 * await os.scarces.list({ tokenId: '1', priceNear: '5' });
 *
 * // Groups & Governance
 * await os.groups.create('dao', { owner: 'alice.near', member_driven: true });
 * await os.groups.join('dao');
 * await os.groups.propose('dao', 'CustomProposal', { title: '...', ... });
 * await os.groups.vote('dao', proposalId, true);
 * const config = await os.groups.getConfig('dao');
 *
 * // Permissions
 * const canWrite = await os.permissions.has('alice.near', 'bob.near', 'post', 2);
 *
 * // Execute any action directly (groups, governance, permissions, custom)
 * await os.execute({ type: 'create_group', group_id: 'dao', config: {...} });
 * await os.execute({ type: 'create_proposal', group_id: 'dao', ... });
 *
 * // Rewards
 * await os.rewards.credit({ accountId: 'alice.near', amount: '1000000' });
 *
 * // Query indexed data
 * const { data } = await os.query.posts({ author: 'alice.near' });
 *
 * // Storage
 * const { cid } = await os.storage.upload(file);
 * ```
 */
export class OnSocial {
  /** Authentication (login, refresh, logout). */
  readonly auth: AuthModule;
  /** Social graph (profiles, posts, standings, reactions, saves, endorsements, attestations). */
  readonly social: SocialModule;
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
  /** Pages — configure and read onsocial.id page data. */
  readonly pages: PagesModule;

  /** The underlying HTTP client (for advanced usage). */
  readonly http: HttpClient;

  constructor(config: OnSocialConfig = {}) {
    this.http = new HttpClient(config);
    this.auth = new AuthModule(this.http);
    this.social = new SocialModule(this.http);
    this.scarces = new ScarcesModule(this.http);
    this.rewards = new RewardsModule(this.http);
    this.query = new QueryModule(this.http);
    this.storage = new StorageModule(this.http);
    this.webhooks = new WebhooksModule(this.http, config.appId);
    this.notifications = new NotificationsModule(this.http, config.appId);
    this.groups = new GroupsModule(this.http);
    this.permissions = new PermissionsModule(this.http);
    this.chain = new ChainModule(this.http);
    this.pages = new PagesModule(this.http);
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
    return this.http.post<RelayResponse>('/relay/execute', {
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

    const mint = await this.scarces.mint(mintOpts);
    const result: MintPostResult = { mint };

    // Auto-list if price specified
    if (opts.priceNear && mint.txHash) {
      // txHash contains the token ID from the mint response
      result.listing = await this.scarces.list({
        tokenId: mint.txHash,
        priceNear: opts.priceNear,
      });
    }

    return result;
  }
}
