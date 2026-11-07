/** Allowlist for the OnAPI proxy. Kept out of route.ts so Next's route type check only sees handlers. */
export type ProxyBodyKind = 'none' | 'json' | 'form';

export interface AllowedProxyRoute {
  method: 'GET' | 'POST' | 'DELETE';
  /**
   * Exact path, or a single-segment wildcard with a trailing `/*`
   * (e.g. `compose/generate/variation-set/*` → `…/variation-set/<jobId>`).
   */
  path: string;
  body: ProxyBodyKind;
  /**
   * Forward the browser `Authorization` bearer (viewer JWT) and skip the
   * server API key. Required for private prefs like mutes.
   */
  forwardAuthorization?: boolean;
  /**
   * Public reads that still work when the app has no server API key.
   * Sends `X-API-Key` when one is configured.
   */
  optionalApiKey?: boolean;
}

export const ALLOWED_PROXY_ROUTES: AllowedProxyRoute[] = [
  { method: 'POST', path: 'storage/upload', body: 'form' },
  { method: 'POST', path: 'compose/prepare/set', body: 'json' },
  { method: 'GET', path: 'relay/latest-block', body: 'none' },
  { method: 'POST', path: 'relay/delegate', body: 'json' },
  { method: 'GET', path: 'data/get-one', body: 'none' },
  { method: 'GET', path: 'data/get', body: 'none' },
  // Offer save counts existing keys before the write (`os.offers.list`).
  { method: 'GET', path: 'data/keys', body: 'none' },
  // Live guild page reads.
  { method: 'GET', path: 'data/group-config', body: 'none' },
  { method: 'GET', path: 'data/group-stats', body: 'none' },
  { method: 'GET', path: 'data/group-is-member', body: 'none' },
  { method: 'GET', path: 'data/group-is-owner', body: 'none' },
  // Banned viewers (`os.groups.isBlacklisted`) on guild pages and threads.
  { method: 'GET', path: 'data/group-is-blacklisted', body: 'none' },
  { method: 'GET', path: 'data/group-join-request', body: 'none' },
  { method: 'GET', path: 'data/proposals', body: 'none' },
  { method: 'GET', path: 'data/proposal', body: 'none' },
  { method: 'GET', path: 'data/proposal-tally', body: 'none' },
  { method: 'GET', path: 'data/vote', body: 'none' },
  { method: 'GET', path: 'data/proposal-count', body: 'none' },
  { method: 'GET', path: 'data/has-group-admin', body: 'none' },
  { method: 'GET', path: 'data/has-group-moderate', body: 'none' },
  // Allowlist room writer checks (`os.permissions.has` / space WRITE grants).
  { method: 'GET', path: 'data/has-permission', body: 'none' },
  { method: 'GET', path: 'data/permissions', body: 'none' },

  // SOCIAL wallet balance — premium mood unlock preflight.
  { method: 'GET', path: 'data/ft-balance-of', body: 'none' },
  // Boost position + network stats (portfolio boost sheet).
  { method: 'GET', path: 'data/boost-account', body: 'none' },
  { method: 'GET', path: 'data/boost-lock-status', body: 'none' },
  { method: 'GET', path: 'data/boost-rewards-live', body: 'none' },
  { method: 'GET', path: 'data/boost-stats', body: 'none' },
  // SOCIAL token icon / decimals for amount fields.
  { method: 'GET', path: 'data/ft-metadata', body: 'none' },
  // Wallet storage buffer + personal storage reads.
  { method: 'GET', path: 'data/storage-balance', body: 'none' },
  { method: 'GET', path: 'data/platform-allowance', body: 'none' },
  { method: 'GET', path: 'data/shared-pool', body: 'none' },
  // Guild storage pool + sponsor grants (Members ⋮ / Settings → Storage).
  { method: 'GET', path: 'data/group-pool', body: 'none' },
  { method: 'GET', path: 'data/group-sponsor-quota', body: 'none' },
  { method: 'GET', path: 'data/group-sponsor-default', body: 'none' },
  // Indexed reads after profile save (`os.profiles.get`) and other SDK queries.
  { method: 'POST', path: 'graph/query', body: 'json' },

  // Scarces — NEP-171 token read for feed embed matching (`nft_token`).
  { method: 'GET', path: 'data/scarces-token', body: 'none' },

  // Scarces — list / buy / cancel (lazy + fixed-price + native resale).
  { method: 'POST', path: 'compose/prepare/lazy-list', body: 'form' },
  { method: 'POST', path: 'compose/preview/text-card', body: 'json' },
  { method: 'POST', path: 'compose/prepare/purchase-lazy-list', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/purchase-native-scarce',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/cancel-lazy-list', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/list-native-scarce',
    body: 'json',
  },
  { method: 'GET', path: 'intents/tokens', body: 'none', optionalApiKey: true },
  {
    method: 'GET',
    path: 'intents/near-usd',
    body: 'none',
    optionalApiKey: true,
  },
  { method: 'GET', path: 'intents/status', body: 'none', optionalApiKey: true },
  { method: 'POST', path: 'intents/quote', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/delist-native-scarce',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/update-sale-price', body: 'json' },

  // Scarces — auctions (Market Sell / Bid / cancel / settle).
  { method: 'POST', path: 'compose/prepare/list-auction', body: 'json' },
  { method: 'POST', path: 'compose/prepare/place-bid', body: 'json' },
  { method: 'POST', path: 'compose/prepare/settle-auction', body: 'json' },
  { method: 'POST', path: 'compose/prepare/cancel-auction', body: 'json' },

  // Scarces — token offers (Make offer / cancel / accept).
  { method: 'POST', path: 'compose/prepare/make-offer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/cancel-offer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/accept-offer', body: 'json' },

  // Scarces — create drop (single / music / variation / generative).
  {
    method: 'POST',
    path: 'compose/prepare/create-collection',
    body: 'form',
  },
  { method: 'POST', path: 'compose/upload/variation-set', body: 'form' },
  { method: 'POST', path: 'compose/generate/variation-set', body: 'form' },
  {
    method: 'GET',
    path: 'compose/generate/variation-set/*',
    body: 'none',
  },
  // Scarces — primary mint from a collection page + allowlist edits.
  {
    method: 'POST',
    path: 'compose/prepare/purchase-from-collection',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/set-allowlist', body: 'json' },
  // Scarces — door / redeem staff (add / remove / replace roster).
  { method: 'POST', path: 'compose/prepare/add-redeemer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/remove-redeemer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/set-redeemers', body: 'json' },
  // Scarces — door Admit / coupon Redeem (staff wallet signs).
  { method: 'POST', path: 'compose/prepare/redeem-token', body: 'json' },
  // Scarces — creator pause / resume / delete (empty only).
  { method: 'POST', path: 'compose/prepare/pause-collection', body: 'json' },
  { method: 'POST', path: 'compose/prepare/resume-collection', body: 'json' },
  { method: 'POST', path: 'compose/prepare/delete-collection', body: 'json' },
  // Scarces — postpone entry, cancel, and reclaim leftover refunds.
  { method: 'POST', path: 'compose/prepare/renew-token', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/update-collection-template-expiry',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/set-collection-metadata',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/cancel-collection', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/withdraw-unclaimed-refunds',
    body: 'json',
  },
  // Scarces — send or burn a scarce.
  { method: 'POST', path: 'compose/prepare/transfer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/batch-transfer', body: 'json' },
  { method: 'POST', path: 'compose/prepare/burn', body: 'json' },

  // Hubs (apps) — register / config / creators / ownership.
  { method: 'POST', path: 'compose/prepare/register-app', body: 'json' },
  { method: 'POST', path: 'compose/prepare/set-app-config', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/transfer-app-ownership',
    body: 'json',
  },
  { method: 'POST', path: 'compose/prepare/add-moderator', body: 'json' },
  { method: 'POST', path: 'compose/prepare/remove-moderator', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/add-approved-creator',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/add-approved-creators',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/remove-approved-creator',
    body: 'json',
  },
  // Hubs — ask / withdraw / staff decide publish access.
  { method: 'POST', path: 'compose/prepare/request-publish', body: 'json' },
  {
    method: 'POST',
    path: 'compose/prepare/cancel-publish-request',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/decline-publish-request',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/block-publish-requester',
    body: 'json',
  },
  {
    method: 'POST',
    path: 'compose/prepare/unblock-publish-requester',
    body: 'json',
  },

  // Gateway wallet auth (NEP-413) — used to obtain a viewer JWT for mutes.
  { method: 'POST', path: 'auth/challenge', body: 'json' },
  { method: 'POST', path: 'auth/login', body: 'json' },

  // Community dapp handoff — viewer JWT issues a one-time code.
  {
    method: 'POST',
    path: 'auth/app-handoff',
    body: 'json',
    forwardAuthorization: true,
  },
  // Public exchange on the dapp origin (also usable via the OS proxy).
  {
    method: 'POST',
    path: 'auth/app-session',
    body: 'json',
    optionalApiKey: true,
  },

  // Private mute prefs (viewer JWT — not the server API key).
  {
    method: 'GET',
    path: 'developer/mutes',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'POST',
    path: 'developer/mutes',
    body: 'json',
    forwardAuthorization: true,
  },
  {
    method: 'DELETE',
    path: 'developer/mutes/*',
    body: 'none',
    forwardAuthorization: true,
  },

  // Private DM mailbox (ciphertext envelopes — viewer JWT).
  {
    method: 'GET',
    path: 'developer/dm/threads',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'GET',
    path: 'developer/dm/unread-count',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'GET',
    path: 'developer/dm/threads/*',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'POST',
    path: 'developer/dm/send',
    body: 'json',
    forwardAuthorization: true,
  },
  {
    method: 'POST',
    path: 'developer/dm/read',
    body: 'json',
    forwardAuthorization: true,
  },

  // First-party notifications inbox (viewer JWT — default app namespace).
  {
    method: 'GET',
    path: 'developer/notifications',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'GET',
    path: 'developer/notifications/count',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'GET',
    path: 'developer/notifications/types',
    body: 'none',
    forwardAuthorization: true,
  },
  {
    method: 'POST',
    path: 'developer/notifications/read',
    body: 'json',
    forwardAuthorization: true,
  },

  // Public community dapp board (listed https sites).
  {
    method: 'GET',
    path: 'developer/apps/catalog',
    body: 'none',
    optionalApiKey: true,
  },
];

