// ---------------------------------------------------------------------------
// SubscribeModule — lightweight polling subscriptions for indexed data.
//
// We deliberately do NOT open WebSockets here. Hasura subscriptions require
// websocket transport, an authenticated socket per subscriber, and pose
// connection-pool issues from browsers behind NAT/proxies. For the in-feed
// trading DX we only need ~5s freshness, which polling delivers reliably
// across every environment with one HTTP round-trip.
//
// Usage:
//   const stop = os.subscribe.scarces.byCollection('col-1', (events, info) => {
//     for (const e of events) { ...render new event... }
//   });
//   ...
//   stop();
// ---------------------------------------------------------------------------

import { ScarcesSubscribeApi } from './scarces.js';
import type { QueryModule } from '../../query/index.js';

export class SubscribeModule {
  /** Scarces / NFT event subscriptions (collection, token, owner, market). */
  readonly scarces: ScarcesSubscribeApi;

  constructor(query: QueryModule) {
    this.scarces = new ScarcesSubscribeApi(query);
  }
}

export { ScarcesSubscribeApi } from './scarces.js';
export type {
  Unsubscribe,
  SubscriptionInfo,
  SubscriptionHandler,
  SubscribeOptions,
} from './scarces.js';
