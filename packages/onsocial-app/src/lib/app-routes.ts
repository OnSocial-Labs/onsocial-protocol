export const APP_HOME_PATH = '/home';
/** Global wallet / Collect sheet (`?sheet=wallet`) — dock account drawer. */
export const APP_SHEET_PARAM = 'sheet';

export function parseAppWalletSheetParam(
  raw: string | null | undefined
): 'wallet' | null {
  return (raw ?? '').trim().toLowerCase() === 'wallet' ? 'wallet' : null;
}

export function homeWalletPath(): string {
  return `${APP_HOME_PATH}?${APP_SHEET_PARAM}=wallet`;
}
export const APP_DISCOVER_PATH = '/discover';
export const APP_GROUPS_PATH = '/groups';
export const APP_MARKET_PATH = '/market';
/** Protocol DAO governance + treasury (in-app). */
export const APP_PROTOCOL_PATH = '/protocol';
/** Community DAO directory — portfolio homes for org DAOs. */
export const APP_DAOS_PATH = '/daos';
/** Open the DAOs app create sheet (`/daos?create=1`). */
export const DAOS_CREATE_QUERY = 'create';

export function daosCreateHref(): string {
  return `${APP_DAOS_PATH}?${DAOS_CREATE_QUERY}=1`;
}
/** Private messages inbox. */
export const APP_MESSAGES_PATH = '/messages';
/** Activity / notifications inbox. */
export const APP_NOTIFICATIONS_PATH = '/notifications';
/** Protocol leaderboard slide-over destination. */
export const APP_LEADERBOARD_PATH = '/leaderboard';
/** Query key for leaderboard track (`reputation` | `influence` | `earners`). */
export const LEADERBOARD_TRACK_PARAM = 'track';
/**
 * Legacy DAO workspace path (`/dao/[accountId]`).
 * Canonical home is `/@accountId` via {@link daoPath}; `/dao` permanently redirects.
 */
export const APP_DAO_PATH = '/dao';
/** Social drop discovery — Live / Closing / Upcoming / New / Loved / Traded / Finished / Saved. */
export const APP_DROPS_PATH = '/drops';
/** Query key for Drops catalog sort. */
export const DROPS_SORT_PARAM = 'sort';

/** Query key that pre-filters Market / Collectibles / Drops by medium. */
export const MARKET_KIND_PARAM = 'kind';
/** Collectibles vault search (`q=night`). */
export const COLLECTIBLES_SEARCH_PARAM = 'q';
/** Query key for Market browse sort (`newest` | `price-asc` | `price-desc` | `ending`). */
export const MARKET_SORT_PARAM = 'sort';

export type MarketSortParam =
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'ending';

const MARKET_SORT_VALUES = new Set<string>([
  'newest',
  'price-asc',
  'price-desc',
  'ending',
]);

/** Parse `?sort=` for Market; defaults to newest. */
export function parseMarketSortParam(
  raw: string | null | undefined
): MarketSortParam {
  const value = raw?.trim().toLowerCase() ?? '';
  if (MARKET_SORT_VALUES.has(value)) return value as MarketSortParam;
  return 'newest';
}

export type DropsSortParam =
  | 'live'
  | 'closing'
  | 'upcoming'
  | 'finished'
  | 'new'
  | 'loved'
  | 'traded'
  | 'saved';

export type LeaderboardTrackParam =
  | 'reputation'
  | 'influence'
  | 'earners';

const LEADERBOARD_TRACK_VALUES = new Set<string>([
  'reputation',
  'influence',
  'earners',
]);

/** Parse `?track=` for leaderboard; defaults to reputation. */
export function parseLeaderboardTrackParam(
  raw: string | null | undefined
): LeaderboardTrackParam {
  const value = raw?.trim().toLowerCase() ?? '';
  if (LEADERBOARD_TRACK_VALUES.has(value)) {
    return value as LeaderboardTrackParam;
  }
  return 'reputation';
}

/** Leaderboard path, optionally deep-linked to a track tab. */
export function leaderboardPath(opts?: {
  track?: LeaderboardTrackParam | null;
  /** Include `?track=reputation` — share links, not in-app navigation. */
  includeDefaultTrack?: boolean;
}): string {
  const track = opts?.track?.trim().toLowerCase() ?? '';
  const resolved =
    track && LEADERBOARD_TRACK_VALUES.has(track)
      ? track
      : 'reputation';
  if (resolved === 'reputation' && !opts?.includeDefaultTrack) {
    return APP_LEADERBOARD_PATH;
  }
  return `${APP_LEADERBOARD_PATH}?${LEADERBOARD_TRACK_PARAM}=${encodeURIComponent(resolved)}`;
}

const DROPS_SORT_VALUES = new Set<string>([
  'live',
  'closing',
  'upcoming',
  'finished',
  'new',
  'loved',
  'traded',
  'saved',
]);

/** Legacy URL aliases → Live (Minting / Minted tabs removed). */
const DROPS_SORT_ALIASES: Record<string, DropsSortParam> = {
  minting: 'live',
  volume: 'live',
};

/** Parse `?sort=` for Drops; defaults to `live`. */
export function parseDropsSortParam(
  raw: string | null | undefined
): DropsSortParam {
  const value = raw?.trim().toLowerCase() ?? '';
  if (DROPS_SORT_ALIASES[value]) return DROPS_SORT_ALIASES[value];
  if (DROPS_SORT_VALUES.has(value)) return value as DropsSortParam;
  return 'live';
}

/**
 * Mediums exposed on the Drops discovery rail (subset of Market `?kind=`).
 * Legacy `music` normalizes to `audio`.
 */
const DROPS_KIND_VALUES = new Set<string>([
  'thought',
  'art',
  'writing',
  'audio',
  'video',
  'ticket',
]);

export type DropsMediumParam =
  | 'all'
  | 'thought'
  | 'art'
  | 'writing'
  | 'audio'
  | 'video'
  | 'ticket';

/** Parse Market-shared `?kind=` for Drops; unknown → `all`. */
export function parseDropsMediumParam(
  raw: string | null | undefined
): DropsMediumParam {
  const value = raw?.trim().toLowerCase() ?? '';
  const normalized = value === 'music' ? 'audio' : value;
  if (normalized && DROPS_KIND_VALUES.has(normalized)) {
    return normalized as DropsMediumParam;
  }
  return 'all';
}

/** Query key for audio release format (`single` | `album` | `podcast`). */
export const MARKET_AUDIO_FORMAT_PARAM = 'audioFormat';

/** Drops catalog path — deep-link sort, medium, and/or audio format. */
export function dropsPath(opts?: {
  sort?: DropsSortParam | null;
  kind?: DropsMediumParam | string | null;
  audioFormat?: string | null;
}): string {
  const params = new URLSearchParams();
  const sort = opts?.sort?.trim().toLowerCase() ?? '';
  if (sort && sort !== 'live' && DROPS_SORT_VALUES.has(sort)) {
    params.set(DROPS_SORT_PARAM, sort);
  }
  const medium = parseDropsMediumParam(opts?.kind);
  if (medium !== 'all') {
    params.set(MARKET_KIND_PARAM, medium);
  }
  const format = opts?.audioFormat?.trim().toLowerCase() ?? '';
  if (
    medium === 'audio' &&
    (format === 'single' || format === 'album' || format === 'podcast')
  ) {
    params.set(MARKET_AUDIO_FORMAT_PARAM, format);
  }
  const qs = params.toString();
  return qs ? `${APP_DROPS_PATH}?${qs}` : APP_DROPS_PATH;
}

/** Owner vault — use holdings (Read / Play / Show pass). Create stays on Market. */
export const APP_COLLECTIBLES_PATH = '/collectibles';
/** Focused Collectibles player for music / video holdings. */
export const APP_COLLECTIBLES_PLAY_PATH = '/collectibles/play';
export const APP_COLLECTION_PATH = '/collection';
export const APP_DROP_CREATE_PATH = '/market/create';
export const APP_APPS_PATH = '/apps';
export const APP_APP_CREATE_PATH = '/apps/create';
export const APP_SERIES_PATH = '/series';

/** Query key that pre-filters Market to one creator / seller. */
export const MARKET_CREATOR_PARAM = 'creator';

/** Query key that pre-filters Market to one app / store. */
export const MARKET_APP_PARAM = 'app';

/** Query key for secondary discovery facets (CSV of genre / subject slugs). */
export const MARKET_FACETS_PARAM = 'facets';

/** Query key for Collectibles focused player (`?c=collectionId`). */
export const COLLECTIBLES_PLAY_PARAM = 'c';
/** Optional owned edition for Sell on the focused player (`?t=tokenId`). */
export const COLLECTIBLES_PLAY_TOKEN_PARAM = 't';

/** Query key for Protocol board (`governance` | `treasury` | `community`). */
export const PROTOCOL_DAO_BOARD_PARAM = 'dao';

/** Query key for community / arbitrary Sputnik DAO account. */
export const PROTOCOL_DAO_ACCOUNT_PARAM = 'account';

/** Query key for a focused proposal id on Protocol. */
export const PROTOCOL_PROPOSAL_PARAM = 'proposal';

/** Query key for Protocol feed status filter. */
export const PROTOCOL_STATUS_PARAM = 'status';

/** Query key for Protocol feed text search. */
export const PROTOCOL_SEARCH_PARAM = 'q';

/** Query key for Protocol feed family lens (`face` | `boost` | …). */
export const PROTOCOL_FAMILY_PARAM = 'kind';

export type ProtocolDaoBoard = 'governance' | 'treasury' | 'community';

export type ProtocolFeedStatusFilter =
  | 'open'
  | 'approved'
  | 'rejected'
  | 'removed'
  | 'expired'
  | 'failed'
  | 'moved'
  | 'all';

export function parseProtocolDaoBoard(
  raw: string | null | undefined
): ProtocolDaoBoard {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === 'treasury') return 'treasury';
  if (value === 'community') return 'community';
  return 'governance';
}

export function parseProtocolFeedStatus(
  raw: string | null | undefined
): ProtocolFeedStatusFilter {
  const value = raw?.trim().toLowerCase() ?? '';
  switch (value) {
    case 'open':
    case 'inprogress':
    case 'in_progress':
    case 'review':
      return 'open';
    case 'approved':
    case 'rejected':
    case 'removed':
    case 'expired':
    case 'failed':
    case 'moved':
    case 'all':
      return value;
    default:
      return 'all';
  }
}

export function parseProtocolProposalId(
  raw: string | null | undefined
): number | null {
  if (!raw?.trim()) return null;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseProtocolSearchQuery(
  raw: string | null | undefined
): string {
  return raw?.trim() ?? '';
}

/** Protocol home, optionally deep-linked to board, account, status, family, search, or proposal. */
export function protocolPath(opts?: {
  board?: ProtocolDaoBoard | null;
  account?: string | null;
  status?: ProtocolFeedStatusFilter | null;
  family?: string | null;
  proposal?: number | null;
  q?: string | null;
}): string {
  const board = opts?.board ?? 'governance';
  const account = opts?.account?.trim().toLowerCase() ?? '';
  const params = new URLSearchParams();
  if (board === 'treasury') {
    params.set(PROTOCOL_DAO_BOARD_PARAM, 'treasury');
  } else if (board === 'community') {
    params.set(PROTOCOL_DAO_BOARD_PARAM, 'community');
    if (account) {
      params.set(PROTOCOL_DAO_ACCOUNT_PARAM, account);
    }
  }
  const status = opts?.status ?? null;
  if (status && status !== 'all') {
    params.set(PROTOCOL_STATUS_PARAM, status);
  }
  const family = opts?.family?.trim().toLowerCase() ?? '';
  if (family && family !== 'all') {
    params.set(PROTOCOL_FAMILY_PARAM, family);
  }
  const q = opts?.q?.trim() ?? '';
  if (q) {
    params.set(PROTOCOL_SEARCH_PARAM, q);
  }
  if (opts?.proposal != null && Number.isInteger(opts.proposal)) {
    params.set(PROTOCOL_PROPOSAL_PARAM, String(opts.proposal));
  }
  const query = params.toString();
  return query ? `${APP_PROTOCOL_PATH}?${query}` : APP_PROTOCOL_PATH;
}

/** Public DAO home — same portfolio face as people (`/@accountId`). */
export function daoPath(daoAccountId: string): string {
  const id = daoAccountId.trim().toLowerCase();
  if (!id) return APP_DAOS_PATH;
  return `/@${encodeURIComponent(id)}`;
}

/** Private messages inbox, optionally deep-linked to a peer or thread. */
export function messagesPath(opts?: {
  peer?: string | null;
  threadId?: string | null;
}): string {
  const params = new URLSearchParams();
  const peer = opts?.peer?.trim().toLowerCase();
  const threadId = opts?.threadId?.trim();
  if (peer) params.set('peer', peer);
  if (threadId) params.set('thread', threadId);
  const query = params.toString();
  return query ? `${APP_MESSAGES_PATH}?${query}` : APP_MESSAGES_PATH;
}

/** Activity inbox. */
export function notificationsPath(): string {
  return APP_NOTIFICATIONS_PATH;
}

/**
 * DAO portfolio deep-linked to a proposal feed state.
 * Opens `/@accountId` and the Proposals overlay (shareable).
 */
export function daoPortfolioPath(
  daoAccountId: string,
  opts?: {
    status?: ProtocolFeedStatusFilter | null;
    family?: string | null;
    proposal?: number | null;
    q?: string | null;
  }
): string {
  const base = daoPath(daoAccountId);
  const params = new URLSearchParams();
  const status = opts?.status ?? null;
  if (status && status !== 'all') {
    params.set(PROTOCOL_STATUS_PARAM, status);
  }
  const family = opts?.family?.trim().toLowerCase() ?? '';
  if (family && family !== 'all') {
    params.set(PROTOCOL_FAMILY_PARAM, family);
  }
  const q = opts?.q?.trim() ?? '';
  if (q) {
    params.set(PROTOCOL_SEARCH_PARAM, q);
  }
  if (opts?.proposal != null && Number.isInteger(opts.proposal)) {
    params.set(PROTOCOL_PROPOSAL_PARAM, String(opts.proposal));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Market path with optional medium + sort deep-links. */
export function marketPath(opts?: {
  kind?: string | null;
  sort?: MarketSortParam | null;
}): string {
  const params = new URLSearchParams();
  const kind = opts?.kind?.trim().toLowerCase() ?? '';
  if (kind && kind !== 'all') {
    params.set(MARKET_KIND_PARAM, kind === 'music' ? 'audio' : kind);
  }
  const sort = opts?.sort?.trim().toLowerCase() ?? '';
  if (sort && sort !== 'newest' && MARKET_SORT_VALUES.has(sort)) {
    params.set(MARKET_SORT_PARAM, sort);
  }
  const qs = params.toString();
  return qs ? `${APP_MARKET_PATH}?${qs}` : APP_MARKET_PATH;
}

/** Market pre-filtered to a single creator's live listings. */
export function marketCreatorPath(accountId: string): string {
  const seller = accountId.trim();
  if (!seller) return APP_MARKET_PATH;
  return `${APP_MARKET_PATH}?${MARKET_CREATOR_PARAM}=${encodeURIComponent(seller)}`;
}

/** Market pre-filtered to a single app's live listings. */
export function marketAppPath(appId: string): string {
  const id = appId.trim();
  if (!id) return APP_MARKET_PATH;
  return `${APP_MARKET_PATH}?${MARKET_APP_PARAM}=${encodeURIComponent(id)}`;
}

/** Market pre-filtered to one medium kind (art / writing / audio). */
export function marketKindPath(kind: string): string {
  const value = kind.trim().toLowerCase();
  if (!value) return APP_MARKET_PATH;
  return `${APP_MARKET_PATH}?${MARKET_KIND_PARAM}=${encodeURIComponent(value)}`;
}

/** Collectibles hub pre-filtered to one medium kind. */
export function collectiblesKindPath(kind: string): string {
  const value = kind.trim().toLowerCase();
  if (!value || value === 'all') return APP_COLLECTIBLES_PATH;
  return `${APP_COLLECTIBLES_PATH}?${MARKET_KIND_PARAM}=${encodeURIComponent(value)}`;
}

/** CSV facets query value, or null when empty. */
export function marketFacetsParamValue(facets: string[]): string | null {
  const cleaned = facets.map((slug) => slug.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : null;
}

/** Parse `?facets=a,b` into slug list (no vocab filter — caller normalizes). */
export function parseMarketFacetsParam(
  raw: string | null | undefined
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
}

/** Focused player for a music / video collection holding. */
export function collectiblesPlayPath(
  collectionId: string,
  opts?: { tokenId?: string | null }
): string {
  const id = collectionId.trim();
  if (!id) return APP_COLLECTIBLES_PATH;
  const params = new URLSearchParams();
  params.set(COLLECTIBLES_PLAY_PARAM, id);
  const tokenId = opts?.tokenId?.trim();
  if (tokenId) params.set(COLLECTIBLES_PLAY_TOKEN_PARAM, tokenId);
  return `${APP_COLLECTIBLES_PLAY_PATH}?${params.toString()}`;
}

/** Open immersive writing reader on the collection page (`?read=1`). */
export const COLLECTION_READ_QUERY = 'read';

/** Open Show pass on the collection page (`?pass=1`). */
export const COLLECTION_PASS_QUERY = 'pass';

/**
 * Legacy Door deep-link on the drop page (`?door=1`).
 * Prefer {@link collectionDoorPath} / `collectionPath(..., { door: true })`.
 */
export const COLLECTION_DOOR_QUERY = 'door';

/**
 * Legacy coupon Redeem deep-link on the drop page (`?redeem=1`).
 * Prefer {@link collectionRedeemPath} / `collectionPath(..., { redeem: true })`.
 */
export const COLLECTION_REDEEM_QUERY = 'redeem';

/** Optional owned edition for Show pass (`?t=tokenId`). */
export const COLLECTION_PASS_TOKEN_PARAM = COLLECTIBLES_PLAY_TOKEN_PARAM;

/** Fullscreen Door Admit page for event staff. */
export function collectionDoorPath(collectionId: string): string {
  const id = collectionId.trim();
  if (!id) return APP_MARKET_PATH;
  return `${APP_COLLECTION_PATH}/${encodeURIComponent(id)}/door`;
}

/** Fullscreen coupon Redeem page for staff. */
export function collectionRedeemPath(collectionId: string): string {
  const id = collectionId.trim();
  if (!id) return APP_MARKET_PATH;
  return `${APP_COLLECTION_PATH}/${encodeURIComponent(id)}/redeem`;
}

/** Public collection (drop) page. */
export function collectionPath(
  collectionId: string,
  opts?: {
    read?: boolean;
    pass?: boolean;
    door?: boolean;
    redeem?: boolean;
    tokenId?: string | null;
  }
): string {
  const id = collectionId.trim();
  if (!id) return APP_MARKET_PATH;
  if (opts?.door) return collectionDoorPath(id);
  if (opts?.redeem) return collectionRedeemPath(id);
  const base = `${APP_COLLECTION_PATH}/${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  if (opts?.read) params.set(COLLECTION_READ_QUERY, '1');
  if (opts?.pass) params.set(COLLECTION_PASS_QUERY, '1');
  const tokenId = opts?.tokenId?.trim();
  if (tokenId && opts?.pass) {
    params.set(COLLECTION_PASS_TOKEN_PARAM, tokenId);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Public app (store) page. */
export function appPath(appId: string): string {
  const id = appId.trim();
  if (!id) return APP_APPS_PATH;
  return `${APP_APPS_PATH}/${encodeURIComponent(id)}`;
}

/** Public series page — a creator's ongoing drop series. */
export function seriesPagePath(creatorId: string, seriesId: string): string {
  const creator = creatorId.trim();
  const id = seriesId.trim();
  if (!creator || !id) return APP_MARKET_PATH;
  return `${APP_SERIES_PATH}/${encodeURIComponent(creator)}/${encodeURIComponent(id)}`;
}

export function isAppRoutePath(pathname: string): boolean {
  return (
    pathname === APP_HOME_PATH ||
    pathname.startsWith(`${APP_HOME_PATH}/`) ||
    pathname === APP_LEADERBOARD_PATH ||
    pathname.startsWith(`${APP_LEADERBOARD_PATH}/`) ||
    pathname === APP_NOTIFICATIONS_PATH ||
    pathname.startsWith(`${APP_NOTIFICATIONS_PATH}/`) ||
    pathname === APP_MESSAGES_PATH ||
    pathname.startsWith(`${APP_MESSAGES_PATH}/`) ||
    pathname === APP_DISCOVER_PATH ||
    pathname.startsWith(`${APP_DISCOVER_PATH}/`) ||
    pathname === APP_GROUPS_PATH ||
    pathname.startsWith(`${APP_GROUPS_PATH}/`) ||
    pathname === APP_PROTOCOL_PATH ||
    pathname.startsWith(`${APP_PROTOCOL_PATH}/`) ||
    pathname === APP_MARKET_PATH ||
    pathname.startsWith(`${APP_MARKET_PATH}/`) ||
    pathname === APP_DROPS_PATH ||
    pathname.startsWith(`${APP_DROPS_PATH}/`) ||
    pathname === APP_COLLECTIBLES_PATH ||
    pathname.startsWith(`${APP_COLLECTIBLES_PATH}/`) ||
    pathname === APP_COLLECTION_PATH ||
    pathname.startsWith(`${APP_COLLECTION_PATH}/`) ||
    pathname === APP_APPS_PATH ||
    pathname.startsWith(`${APP_APPS_PATH}/`) ||
    pathname === APP_SERIES_PATH ||
    pathname.startsWith(`${APP_SERIES_PATH}/`)
  );
}
