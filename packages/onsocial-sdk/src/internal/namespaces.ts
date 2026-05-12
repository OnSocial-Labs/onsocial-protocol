// ---------------------------------------------------------------------------
// OnSocial SDK — grouped namespaces
//
// These are thin organisational facades over the per-noun modules, giving
// devs a clearer mental map than a flat list of 18 properties on `os.`:
//
//   os.content.{profiles,posts,reactions,saves,endorsements,attestations,
//               standings,feed}      ← user-generated content
//   os.economy.{scarces,rewards} ← value flows
//   os.platform.{storage,permissions,notifications,webhooks,pages}
//                                     ← platform / integration concerns
//
// Top-level shortcuts (`os.posts`, `os.scarces`, …) remain for back-compat.
// ---------------------------------------------------------------------------

import type { ProfilesModule } from '../modules/profiles.js';
import type { PostsModule } from '../modules/posts.js';
import type { ReactionsModule } from '../modules/reactions.js';
import type { SavesModule } from '../modules/saves.js';
import type { EndorsementsModule } from '../modules/endorsements.js';
import type { AttestationsModule } from '../modules/attestations.js';
import type { StandingsModule } from '../modules/standings.js';
import type { QueryModule } from '../query/index.js';
import type { ScarcesModule } from '../modules/scarces/index.js';
import type { RewardsModule } from '../modules/rewards.js';
import type { TokenModule } from '../modules/token.js';
import type { BoostModule } from '../modules/boost.js';
import type { StorageModule } from '../storage/module.js';
import type { PermissionsModule } from '../modules/permissions.js';
import type { NotificationsModule } from '../modules/notifications.js';
import type { WebhooksModule } from '../modules/webhooks.js';
import type { PagesModule } from '../modules/pages.js';
import type { SocialModule } from '../modules/social.js';
import type { HttpClient } from './http.js';
import type { RelayResponse } from '../types.js';
import type { ExecuteAction, ExecuteOptions } from '../client.js';

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
 * - `rewards` — credit / claim / balance
 * - `token`   — SOCIAL fungible-token (NEP-141) view reads
 * - `boost`   — boost contract view reads (account, lock status, reward rate)
 */
export interface EconomyNamespace {
  readonly scarces: ScarcesModule;
  readonly rewards: RewardsModule;
  readonly token: TokenModule;
  readonly boost: BoostModule;
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
 * the SDK hasn't wrapped, a custom OnSocial KV path, or wallet-paid
 * broadcast).
 *
 * - `execute(action, opts?)` — NEP-366 session relay or wallet broadcast
 * - `social`                 — raw OnSocial KV (`set` / `get` / `listKeys`)
 * - `http`                   — direct gateway HTTP client
 *
 * For full protocol primitives (typed `Action`, NEP-366 helpers, `paths`,
 * `CONTRACTS`), import from
 * `@onsocial/sdk/advanced` instead.
 */
export interface RawNamespace {
  /**
   * Execute any action via NEP-366 session relay or wallet broadcast.
   * Same as `os.execute()` at the top level.
   */
  execute(action: ExecuteAction, opts?: ExecuteOptions): Promise<RelayResponse>;
  /** Raw OnSocial KV (`set` / `get` / `listKeys` / `countKeys`). */
  readonly social: SocialModule;
  /** Direct gateway HTTP client. */
  readonly http: HttpClient;
}
