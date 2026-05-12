// ---------------------------------------------------------------------------
// OnSocial SDK — Rewards contract event taxonomy (single source of truth).
//
// Mirrors the literal `event` strings emitted by `contracts/rewards-onsocial`
// via the local `events::emit("<EVENT_NAME>", ...)` helper.
//
// Consumed by:
//   • `src/query/rewards.ts`                      — re-exports REWARDS_EVENT_TYPES
//   • `src/query/rewards-events.parity.test.ts`   — fails CI if the contract
//                                                   source no longer emits an
//                                                   event we declare here.
//
// Rewards events do NOT have a sub-`operation` axis — each event_type IS the
// action (REWARD_CREDITED, REWARD_CLAIMED, …).
// ---------------------------------------------------------------------------

/** Literal `event_type` strings emitted by the rewards contract. */
export const REWARDS_EVENT_TYPES = {
  REWARD_CREDITED: 'REWARD_CREDITED',
  REWARD_CLAIMED: 'REWARD_CLAIMED',
  CLAIM_FAILED: 'CLAIM_FAILED',
  POOL_DEPOSIT: 'POOL_DEPOSIT',
  OWNER_CHANGED: 'OWNER_CHANGED',
  MAX_DAILY_UPDATED: 'MAX_DAILY_UPDATED',
  CALLER_ADDED: 'CALLER_ADDED',
  CALLER_REMOVED: 'CALLER_REMOVED',
  CONTRACT_UPGRADE: 'CONTRACT_UPGRADE',
  APP_REGISTERED: 'APP_REGISTERED',
  APP_UPDATED: 'APP_UPDATED',
  APP_DEACTIVATED: 'APP_DEACTIVATED',
} as const;

export type RewardsEventType =
  (typeof REWARDS_EVENT_TYPES)[keyof typeof REWARDS_EVENT_TYPES];
