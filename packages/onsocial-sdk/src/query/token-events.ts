// ---------------------------------------------------------------------------
// OnSocial SDK — Token (NEP-141) contract event taxonomy (single source of
// truth).
//
// Mirrors the NEP-141 standard events emitted by `contracts/token-onsocial`
// via `near_contract_standards::fungible_token::events::{FtMint, FtBurn,
// FtTransfer}::emit()`.
//
// Consumed by:
//   • `src/query/token.ts`                       — re-exports TOKEN_EVENT_TYPES
//   • `src/query/token-events.parity.test.ts`    — fails CI if the contract
//                                                  source no longer uses the
//                                                  Ft{Mint,Burn,Transfer}
//                                                  helpers backing each event.
//
// NEP-141 events do NOT have a sub-`operation` axis — the event name itself
// IS the action.
// ---------------------------------------------------------------------------

/** Literal `event_type` strings emitted by the token contract (NEP-141). */
export const TOKEN_EVENT_TYPES = {
  FT_MINT: 'ft_mint',
  FT_BURN: 'ft_burn',
  FT_TRANSFER: 'ft_transfer',
} as const;

export type TokenEventType =
  (typeof TOKEN_EVENT_TYPES)[keyof typeof TOKEN_EVENT_TYPES];

/**
 * Map from the SDK event constant to the Rust helper struct name in
 * `near_contract_standards::fungible_token::events`. The parity test scans
 * the token contract source for these struct names to confirm each
 * declared event family is still wired up.
 */
export const TOKEN_RUST_EVENT_HELPERS: Record<TokenEventType, string> = {
  ft_mint: 'FtMint',
  ft_burn: 'FtBurn',
  ft_transfer: 'FtTransfer',
};
