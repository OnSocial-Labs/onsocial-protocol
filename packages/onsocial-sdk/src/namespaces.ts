// ---------------------------------------------------------------------------
// OnSocial SDK — grouped namespaces
//
// These are thin organisational facades over the per-noun modules, giving
// devs a clearer mental map than a flat list of 18 properties on `os.`:
//
//   os.content.{profiles,posts,reactions,saves,endorsements,attestations,
//               standings,feed}      ← user-generated content
//   os.economy.{scarces,nfts,rewards} ← value flows
//   os.platform.{storage,permissions,notifications,webhooks,pages}
//                                     ← platform / integration concerns
//
// Top-level shortcuts (`os.posts`, `os.scarces`, …) remain for back-compat.
// ---------------------------------------------------------------------------

import type { ProfilesModule } from './modules/profiles.js';
import type { PostsModule } from './modules/posts.js';
import type { ReactionsModule } from './modules/reactions.js';
import type { SavesModule } from './modules/saves.js';
import type { EndorsementsModule } from './modules/endorsements.js';
import type { AttestationsModule } from './modules/attestations.js';
import type { StandingsModule } from './modules/standings.js';
import type { QueryModule } from './query/index.js';
import type { ScarcesModule } from './modules/scarces/index.js';
import type { RewardsModule } from './rewards.js';
import type { StorageModule } from './storage.js';
import type { PermissionsModule } from './permissions.js';
import type { NotificationsModule } from './notifications.js';
import type { WebhooksModule } from './webhooks.js';
import type { PagesModule } from './pages.js';
import type { SocialModule } from './social.js';
import type { HttpClient } from './http.js';
import type { RelayResponse } from './types.js';
import type {
  ExecuteAction,
  ExecuteOptions,
  SignedAuth,
} from './client.js';

/**
 * `os.content` — everything an end-user creates or consumes.
 *
 * - `profiles`  — read/write profiles
 * - `posts`     — create posts, replies, quotes (incl. group variants)
 * - `reactions` — add / remove / toggle / summary
 * - `saves`     — bookmark posts
 * - `endorsements` — directed weighted vouches
 * - `attestations` — verifiable typed claims
 * - `standings` — account ↔ account "stand with" graph
 * - `feed`      — indexed reads (alias of `os.query`)
 */
export interface ContentNamespace {
  readonly profiles: ProfilesModule;
  readonly posts: PostsModule;
  readonly reactions: ReactionsModule;
  readonly saves: SavesModule;
  readonly endorsements: EndorsementsModule;
  readonly attestations: AttestationsModule;
  readonly standings: StandingsModule;
  /** Indexed GraphQL reads (same instance as `os.query`). */
  readonly feed: QueryModule;
}

/**
 * `os.economy` — value-flow modules.
 *
 * - `scarces` — collections, mint, list, offers (NFTs)
 * - `nfts`    — alias of `scarces` for discoverability
 * - `rewards` — credit / claim / balance
 */
export interface EconomyNamespace {
  readonly scarces: ScarcesModule;
  /** Alias of `scarces` — same instance, friendlier name for newcomers. */
  readonly nfts: ScarcesModule;
  readonly rewards: RewardsModule;
}

/**
 * `os.platform` — dev-platform / integration concerns.
 *
 * - `storage`       — IPFS file/JSON upload
 * - `permissions`   — account + key permissions
 * - `notifications` — push + in-app notifications (pro tier+)
 * - `webhooks`      — outbound webhook endpoints (pro tier+)
 * - `pages`         — onsocial.id page configuration
 */
export interface PlatformNamespace {
  readonly storage: StorageModule;
  readonly permissions: PermissionsModule;
  readonly notifications: NotificationsModule;
  readonly webhooks: WebhooksModule;
  readonly pages: PagesModule;
}

/**
 * `os.raw` — escape hatches for granular control.
 *
 * Use these when the opinionated `os.content.*` / `os.economy.*` /
 * `os.platform.*` modules don't model what you need yet (e.g. an action
 * the SDK hasn't wrapped, a custom NEAR Social path, or a pre-signed
 * payload from a wallet).
 *
 * - `execute(action, opts?)` — gateway relayer with intent auth (gasless)
 * - `submit(action, opts)`   — gateway relayer with a pre-signed payload
 * - `social`                 — raw NEAR Social KV (`set` / `get` / `listKeys`)
 * - `http`                   — direct gateway HTTP client
 *
 * For full protocol primitives (typed `Action`, `buildSigningPayload`,
 * `DirectRelay`, `paths`, `CONTRACTS`), import from
 * `@onsocial/sdk/advanced` instead.
 */
export interface RawNamespace {
  /**
   * Execute any action via the gateway relayer (intent auth — gasless).
   * Same as `os.execute()` at the top level.
   */
  execute(
    action: ExecuteAction,
    opts?: ExecuteOptions
  ): Promise<RelayResponse>;
  /**
   * Submit a pre-signed action via the gateway relayer.
   * Same as `os.submit()` at the top level.
   */
  submit(
    action: ExecuteAction,
    opts: {
      targetAccount: string;
      auth: SignedAuth;
      options?: Record<string, unknown>;
    }
  ): Promise<RelayResponse>;
  /** Raw NEAR Social KV (`set` / `get` / `listKeys` / `countKeys`). */
  readonly social: SocialModule;
  /** Direct gateway HTTP client. */
  readonly http: HttpClient;
}
