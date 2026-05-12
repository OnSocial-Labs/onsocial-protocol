// ---------------------------------------------------------------------------
// OnSocial SDK — Scarces compose verbs (single source of truth).
//
// Every string here MUST correspond to a `POST /compose/prepare/<verb>` route
// registered by `packages/onsocial-gateway/src/routes/compose/*.ts`. The
// parity test `gateway-routes.parity.test.ts` reads the gateway sources and
// fails CI if any SDK verb is missing on the gateway side (catches the class
// of bug where the SDK calls a verb the gateway doesn't expose, e.g. a typo
// like `purchase-lazy-listing` vs `purchase-lazy-list`).
// ---------------------------------------------------------------------------

export const SCARCES_VERBS = {
  // tokens.ts
  MINT: 'mint',
  TRANSFER: 'transfer',
  BATCH_TRANSFER: 'batch-transfer',
  BURN: 'burn',
  RENEW_TOKEN: 'renew-token',
  REDEEM_TOKEN: 'redeem-token',
  REVOKE_TOKEN: 'revoke-token',
  CLAIM_REFUND: 'claim-refund',

  // collections.ts
  CREATE_COLLECTION: 'create-collection',
  MINT_FROM_COLLECTION: 'mint-from-collection',
  PURCHASE_FROM_COLLECTION: 'purchase-from-collection',
  AIRDROP_FROM_COLLECTION: 'airdrop-from-collection',
  PAUSE_COLLECTION: 'pause-collection',
  RESUME_COLLECTION: 'resume-collection',
  DELETE_COLLECTION: 'delete-collection',
  UPDATE_COLLECTION_PRICE: 'update-collection-price',
  UPDATE_COLLECTION_TIMING: 'update-collection-timing',
  SET_ALLOWLIST: 'set-allowlist',
  REMOVE_FROM_ALLOWLIST: 'remove-from-allowlist',
  SET_COLLECTION_METADATA: 'set-collection-metadata',
  SET_COLLECTION_APP_METADATA: 'set-collection-app-metadata',
  CANCEL_COLLECTION: 'cancel-collection',
  WITHDRAW_UNCLAIMED_REFUNDS: 'withdraw-unclaimed-refunds',

  // market.ts
  LIST_NATIVE_SCARCE: 'list-native-scarce',
  DELIST_NATIVE_SCARCE: 'delist-native-scarce',
  DELIST_EXTERNAL_SCARCE: 'delist-external-scarce',
  UPDATE_SALE_PRICE: 'update-sale-price',
  PURCHASE_NATIVE_SCARCE: 'purchase-native-scarce',

  // auctions.ts
  LIST_AUCTION: 'list-auction',
  PLACE_BID: 'place-bid',
  SETTLE_AUCTION: 'settle-auction',
  CANCEL_AUCTION: 'cancel-auction',

  // offers.ts
  MAKE_OFFER: 'make-offer',
  CANCEL_OFFER: 'cancel-offer',
  ACCEPT_OFFER: 'accept-offer',
  MAKE_COLLECTION_OFFER: 'make-collection-offer',
  CANCEL_COLLECTION_OFFER: 'cancel-collection-offer',
  ACCEPT_COLLECTION_OFFER: 'accept-collection-offer',

  // lazy.ts
  LAZY_LIST: 'lazy-list',
  CANCEL_LAZY_LIST: 'cancel-lazy-list',
  PURCHASE_LAZY_LIST: 'purchase-lazy-list',
  UPDATE_LAZY_LIST_PRICE: 'update-lazy-list-price',
  UPDATE_LAZY_LIST_EXPIRY: 'update-lazy-list-expiry',

  // approvals.ts
  APPROVE: 'approve',
  REVOKE_APPROVAL: 'revoke-approval',
  REVOKE_ALL_APPROVALS: 'revoke-all-approvals',

  // apps.ts
  REGISTER_APP: 'register-app',
  SET_APP_CONFIG: 'set-app-config',
  FUND_APP_POOL: 'fund-app-pool',
  WITHDRAW_APP_POOL: 'withdraw-app-pool',
  TRANSFER_APP_OWNERSHIP: 'transfer-app-ownership',
  ADD_MODERATOR: 'add-moderator',
  REMOVE_MODERATOR: 'remove-moderator',
  BAN_COLLECTION: 'ban-collection',
  UNBAN_COLLECTION: 'unban-collection',

  // storage.ts (apps namespace; per-account storage)
  STORAGE_DEPOSIT: 'storage-deposit',
  STORAGE_WITHDRAW: 'storage-withdraw',
  WITHDRAW_PLATFORM_STORAGE: 'withdraw-platform-storage',
  SET_SPENDING_CAP: 'set-spending-cap',
} as const;

export type ScarcesVerb = (typeof SCARCES_VERBS)[keyof typeof SCARCES_VERBS];
