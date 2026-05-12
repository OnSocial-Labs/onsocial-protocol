// ---------------------------------------------------------------------------
// OnSocial SDK — Scarces contract event taxonomy (single source of truth).
//
// Mirrors the literal `(eventType, operation)` strings emitted by the Rust
// scarces contract via `EventBuilder::new(<TYPE>, "<op>", ...)` in
// `contracts/scarces-onsocial/src/events/*.rs`.
//
// Consumed by:
//   • `src/query/scarces.ts`               — query/filter taxonomy
//   • `src/query/scarces-events.parity.test.ts`
//                                          — fails CI if SDK strings drift
//                                            away from what the contract emits.
//
// When a new event is added to the Rust contract, append it here AND the
// parity test will require no changes (it only fails for *removed* or
// *renamed* operations).
// ---------------------------------------------------------------------------

/** Top-level event families emitted by the scarces contract. */
export const SCARCES_EVENT_TYPES = {
  SCARCE: 'SCARCE_UPDATE',
  COLLECTION: 'COLLECTION_UPDATE',
  LAZY_LISTING: 'LAZY_LISTING_UPDATE',
  OFFER: 'OFFER_UPDATE',
  APP_POOL: 'APP_POOL_UPDATE',
  STORAGE: 'STORAGE_UPDATE',
  CONTRACT: 'CONTRACT_UPDATE',
} as const;

export type ScarcesEventType =
  (typeof SCARCES_EVENT_TYPES)[keyof typeof SCARCES_EVENT_TYPES];

// ---------------------------------------------------------------------------
// Operations grouped by event family. Every literal here MUST appear in the
// corresponding Rust file — the parity test enforces this.
// ---------------------------------------------------------------------------

/** SCARCE_UPDATE family operations (per-token lifecycle + auctions). */
export const SCARCE_OPERATIONS = [
  'list',
  'delist',
  'update_price',
  'purchase',
  'purchase_failed',
  'transfer',
  'list_native',
  'delist_native',
  'auto_delist',
  'renew',
  'revoke',
  'redeem',
  'burn',
  'approval_granted',
  'approval_revoked',
  'all_approvals_revoked',
  'auction_created',
  'auction_bid',
  'auction_settled',
  'auction_cancelled',
  'quick_mint',
] as const;

/** COLLECTION_UPDATE family operations. */
export const COLLECTION_OPERATIONS = [
  'create',
  'purchase',
  'metadata_update',
  'app_metadata_update',
  'creator_mint',
  'airdrop',
  'cancel',
  'refund_claimed',
  'refund_pool_withdrawn',
  'delete',
  'pause',
  'resume',
  'ban',
  'unban',
  'allowlist_update',
  'allowlist_remove',
  'price_update',
  'timing_update',
] as const;

/** LAZY_LISTING_UPDATE family operations (mint-on-purchase). */
export const LAZY_LISTING_OPERATIONS = [
  'created',
  'purchased',
  'cancelled',
  'expired',
  'expiry_updated',
  'price_updated',
] as const;

/** OFFER_UPDATE family operations. */
export const OFFER_OPERATIONS = [
  'offer_made',
  'offer_cancelled',
  'offer_accepted',
  'collection_offer_made',
  'collection_offer_cancelled',
  'collection_offer_accepted',
] as const;

/** APP_POOL_UPDATE family operations. */
export const APP_POOL_OPERATIONS = [
  'register',
  'fund',
  'withdraw',
  'config_update',
  'owner_transferred',
  'moderator_added',
  'moderator_removed',
] as const;

/** STORAGE_UPDATE family operations. */
export const STORAGE_OPERATIONS = [
  'storage_deposit',
  'storage_withdraw',
  'credit_unused_deposit',
  'refund_unused_deposit',
  'prepaid_balance_drawn',
  'prepaid_balance_restored',
  'spending_cap_set',
  'wnear_deposit',
  'wnear_unwrap_failed',
] as const;

/** CONTRACT_UPDATE family operations (admin / config). */
export const CONTRACT_OPERATIONS = [
  'contract_upgrade',
  'owner_transferred',
  'fee_recipient_changed',
  'fee_config_updated',
  'contract_metadata_updated',
  'approved_nft_contract_added',
  'approved_nft_contract_removed',
  'wnear_account_set',
  'platform_storage_funded',
] as const;

/**
 * Full (eventType, operations) emission map. The parity test scans the
 * contract source and asserts each entry below is actually emitted.
 */
export const SCARCES_CONTRACT_EVENTS: Readonly<
  Record<ScarcesEventType, readonly string[]>
> = {
  [SCARCES_EVENT_TYPES.SCARCE]: SCARCE_OPERATIONS,
  [SCARCES_EVENT_TYPES.COLLECTION]: COLLECTION_OPERATIONS,
  [SCARCES_EVENT_TYPES.LAZY_LISTING]: LAZY_LISTING_OPERATIONS,
  [SCARCES_EVENT_TYPES.OFFER]: OFFER_OPERATIONS,
  [SCARCES_EVENT_TYPES.APP_POOL]: APP_POOL_OPERATIONS,
  [SCARCES_EVENT_TYPES.STORAGE]: STORAGE_OPERATIONS,
  [SCARCES_EVENT_TYPES.CONTRACT]: CONTRACT_OPERATIONS,
};
