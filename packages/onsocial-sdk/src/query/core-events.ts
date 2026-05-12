// ---------------------------------------------------------------------------
// OnSocial SDK — core-onsocial contract event taxonomy (single source of
// truth).
//
// Mirrors the literal `event_type` constants in
// `contracts/core-onsocial/src/constants.rs`:
//
//   pub const EVENT_TYPE_DATA_UPDATE:       &str = "DATA_UPDATE";
//   pub const EVENT_TYPE_STORAGE_UPDATE:    &str = "STORAGE_UPDATE";
//   pub const EVENT_TYPE_PERMISSION_UPDATE: &str = "PERMISSION_UPDATE";
//   pub const EVENT_TYPE_GROUP_UPDATE:      &str = "GROUP_UPDATE";
//   pub const EVENT_TYPE_CONTRACT_UPDATE:   &str = "CONTRACT_UPDATE";
//
// Plus the small set of operations the SDK actually filters on. Operations
// not listed here remain accessible via `os.query.graphql` raw escape hatch.
//
// Consumed by:
//   • Various `src/query/*.ts` files (storage, governance, raw, …)
//   • `src/query/core-events.parity.test.ts` — fails CI if any (eventType,
//                                              operation) declared here is
//                                              not actually emitted by the
//                                              core contract source.
// ---------------------------------------------------------------------------

/** Top-level `event_type` strings emitted by the core contract. */
export const CORE_EVENT_TYPES = {
  DATA_UPDATE: 'DATA_UPDATE',
  STORAGE_UPDATE: 'STORAGE_UPDATE',
  PERMISSION_UPDATE: 'PERMISSION_UPDATE',
  GROUP_UPDATE: 'GROUP_UPDATE',
  CONTRACT_UPDATE: 'CONTRACT_UPDATE',
} as const;

export type CoreEventType =
  (typeof CORE_EVENT_TYPES)[keyof typeof CORE_EVENT_TYPES];

/**
 * `DATA_UPDATE` operations the SDK currently filters on. The full set is
 * larger; add an entry here only when a new query is added. Drift is
 * caught by the parity test.
 */
export const DATA_UPDATE_OPERATIONS = ['set'] as const;

/**
 * `STORAGE_UPDATE` operations the SDK currently filters on. Note: the
 * contract emits `storage_tip` (NOT `tip`) — keep this list in sync with the
 * actual emission strings.
 */
export const STORAGE_UPDATE_OPERATIONS = ['storage_tip'] as const;

/**
 * `GROUP_UPDATE` operations the SDK currently filters on (governance).
 */
export const GROUP_UPDATE_OPERATIONS = [
  'vote_cast',
  'group_updated',
  'member_invited',
] as const;

/**
 * Curated (eventType, operations) pairs the SDK queries against. Parity
 * test asserts each entry is emitted by the core contract source.
 */
export const CORE_CONTRACT_EVENTS: Readonly<
  Partial<Record<CoreEventType, readonly string[]>>
> = {
  [CORE_EVENT_TYPES.DATA_UPDATE]: DATA_UPDATE_OPERATIONS,
  [CORE_EVENT_TYPES.STORAGE_UPDATE]: STORAGE_UPDATE_OPERATIONS,
  [CORE_EVENT_TYPES.GROUP_UPDATE]: GROUP_UPDATE_OPERATIONS,
};

/**
 * Map from the Rust constant identifier (1st arg to `EventBuilder::new`) to
 * the emitted `event_type` string. Used by the parity test.
 */
export const CORE_RUST_TYPE_TO_EVENT_TYPE: Record<string, CoreEventType> = {
  EVENT_TYPE_DATA_UPDATE: CORE_EVENT_TYPES.DATA_UPDATE,
  EVENT_TYPE_STORAGE_UPDATE: CORE_EVENT_TYPES.STORAGE_UPDATE,
  EVENT_TYPE_PERMISSION_UPDATE: CORE_EVENT_TYPES.PERMISSION_UPDATE,
  EVENT_TYPE_GROUP_UPDATE: CORE_EVENT_TYPES.GROUP_UPDATE,
  EVENT_TYPE_CONTRACT_UPDATE: CORE_EVENT_TYPES.CONTRACT_UPDATE,
};
