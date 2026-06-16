// ---------------------------------------------------------------------------
// OnSocial SDK — Boost contract event taxonomy (single source of truth).
//
// Mirrors the literal `event` strings emitted by `contracts/boost-onsocial`
// via `self.emit_event("<EVENT_NAME>", ...)`.
//
// Consumed by:
//   • `src/query/boost.ts`                      — re-exports BOOST_EVENT_TYPES
//   • `src/query/boost-events.parity.test.ts`   — fails CI if the contract
//                                                 source no longer emits an
//                                                 event we declare here.
//
// Boost events do NOT have a sub-`operation` axis — each event_type IS the
// action (BOOST_LOCK, REWARDS_CLAIM, …).
// ---------------------------------------------------------------------------

/** Literal `event_type` strings emitted by the boost contract. */
export const BOOST_EVENT_TYPES = {
  BOOST_LOCK: 'BOOST_LOCK',
  BOOST_EXTEND: 'BOOST_EXTEND',
  BOOST_UNLOCK: 'BOOST_UNLOCK',
  UNLOCK_FAILED: 'UNLOCK_FAILED',
  REWARDS_CLAIM: 'REWARDS_CLAIM',
  CLAIM_FAILED: 'CLAIM_FAILED',
  REWARDS_RELEASED: 'REWARDS_RELEASED',
  CREDITS_PURCHASE: 'CREDITS_PURCHASE',
  SCHEDULED_FUND: 'SCHEDULED_FUND',
  STORAGE_DEPOSIT: 'STORAGE_DEPOSIT',
  INFRA_WITHDRAW: 'INFRA_WITHDRAW',
  WITHDRAW_INFRA_FAILED: 'WITHDRAW_INFRA_FAILED',
  INFRA_WITHDRAW_AUTHORITY_SET: 'INFRA_WITHDRAW_AUTHORITY_SET',
  OWNER_CHANGED: 'OWNER_CHANGED',
  CONTRACT_UPGRADE: 'CONTRACT_UPGRADE',
} as const;

export type BoostEventType =
  (typeof BOOST_EVENT_TYPES)[keyof typeof BOOST_EVENT_TYPES];
