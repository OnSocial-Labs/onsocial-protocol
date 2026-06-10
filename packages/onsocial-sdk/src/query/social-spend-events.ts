// ---------------------------------------------------------------------------
// OnSocial SDK - Social Spend contract event taxonomy (single source of truth).
//
// Mirrors the literal `event` strings emitted by `contracts/social-spend-onsocial`
// via `self.emit("EVENT_NAME", ...)`.
// ---------------------------------------------------------------------------

/** Literal `event_type` strings emitted by the social-spend contract. */
export const SOCIAL_SPEND_EVENT_TYPES = {
  ACTION_CONFIG_REMOVED: 'ACTION_CONFIG_REMOVED',
  SEASON_CONFIG_SET: 'SEASON_CONFIG_SET',
  SEASON_POOL_FUNDED: 'SEASON_POOL_FUNDED',
  PAUSE_UPDATED: 'PAUSE_UPDATED',
  TREASURY_UPDATED: 'TREASURY_UPDATED',
  SETTLEMENT_PUBLISHER_UPDATED: 'SETTLEMENT_PUBLISHER_UPDATED',
  OWNER_CHANGED: 'OWNER_CHANGED',
  CONTRACT_UPGRADE: 'CONTRACT_UPGRADE',
  SEASON_ROOT_PUBLISHED: 'SEASON_ROOT_PUBLISHED',
  SOCIAL_TRANSFERRED: 'SOCIAL_TRANSFERRED',
  SOCIAL_TRANSFER_FAILED: 'SOCIAL_TRANSFER_FAILED',
  ACTION_CONFIG_SET: 'ACTION_CONFIG_SET',
  SOCIAL_SPENT: 'SOCIAL_SPENT',
} as const;

export type SocialSpendEventType =
  (typeof SOCIAL_SPEND_EVENT_TYPES)[keyof typeof SOCIAL_SPEND_EVENT_TYPES];
