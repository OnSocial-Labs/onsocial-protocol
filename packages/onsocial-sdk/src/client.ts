// ---------------------------------------------------------------------------
// OnSocial SDK — main client
// ---------------------------------------------------------------------------

import type { OnSocialConfig } from './types.js';
import { HttpClient } from './http.js';
import { AuthModule } from './auth.js';
import { SocialModule } from './social.js';
import { ScarcesModule } from './scarces.js';
import { RewardsModule } from './rewards.js';
import { QueryModule } from './query.js';
import { StorageModule } from './storage.js';

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
 *
 * // Scarces (NFTs)
 * await os.scarces.mint({ title: 'My Art', image: file });
 * await os.scarces.list({ tokenId: '1', priceNear: '5' });
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
  /** Social graph (profiles, posts, standings, reactions). */
  readonly social: SocialModule;
  /** Scarces / NFTs (mint, collections, marketplace, offers). */
  readonly scarces: ScarcesModule;
  /** Rewards (credit, claim, balance). */
  readonly rewards: RewardsModule;
  /** Query indexed data via GraphQL. */
  readonly query: QueryModule;
  /** IPFS storage (upload files and JSON). */
  readonly storage: StorageModule;

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
  }
}
