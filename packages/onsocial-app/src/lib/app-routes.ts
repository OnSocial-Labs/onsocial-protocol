export const APP_HOME_PATH = '/home';
export const APP_DISCOVER_PATH = '/discover';
export const APP_GROUPS_PATH = '/groups';
export const APP_MARKET_PATH = '/market';
/** Protocol DAO governance + treasury (in-app). */
export const APP_PROTOCOL_PATH = '/protocol';
/** Social drop discovery — Live / Closing / Upcoming / Finished / New / Loved / Saved. */
export const APP_DROPS_PATH = '/drops';
/** Query key for Drops catalog sort. */
export const DROPS_SORT_PARAM = 'sort';

export type DropsSortParam =
  | 'live'
  | 'closing'
  | 'upcoming'
  | 'finished'
  | 'new'
  | 'loved'
  | 'saved';

const DROPS_SORT_VALUES = new Set<string>([
  'live',
  'closing',
  'upcoming',
  'finished',
  'new',
  'loved',
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

/** Drops catalog path, optionally deep-linked to a sort tab. */
export function dropsPath(opts?: { sort?: DropsSortParam | null }): string {
  const sort = opts?.sort?.trim().toLowerCase() ?? '';
  if (!sort || sort === 'live' || !DROPS_SORT_VALUES.has(sort)) {
    return APP_DROPS_PATH;
  }
  return `${APP_DROPS_PATH}?${DROPS_SORT_PARAM}=${encodeURIComponent(sort)}`;
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

/** Query key that pre-filters Market / Collectibles by medium (`art` | `writing` | `audio`). */
export const MARKET_KIND_PARAM = 'kind';

/** Query key for secondary discovery facets (CSV of genre / subject slugs). */
export const MARKET_FACETS_PARAM = 'facets';

/** Query key for audio release format (`single` | `album` | `podcast`). */
export const MARKET_AUDIO_FORMAT_PARAM = 'audioFormat';

/** Query key for Collectibles focused player (`?c=collectionId`). */
export const COLLECTIBLES_PLAY_PARAM = 'c';
/** Optional owned edition for Sell on the focused player (`?t=tokenId`). */
export const COLLECTIBLES_PLAY_TOKEN_PARAM = 't';

/** Query key for Protocol board (`governance` | `treasury` | `community`). */
export const PROTOCOL_DAO_BOARD_PARAM = 'dao';

/** Query key for community / arbitrary Sputnik DAO account. */
export const PROTOCOL_DAO_ACCOUNT_PARAM = 'account';

export type ProtocolDaoBoard = 'governance' | 'treasury' | 'community';

export function parseProtocolDaoBoard(
  raw: string | null | undefined
): ProtocolDaoBoard {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === 'treasury') return 'treasury';
  if (value === 'community') return 'community';
  return 'governance';
}

/** Protocol home, optionally deep-linked to a DAO board or community account. */
export function protocolPath(opts?: {
  board?: ProtocolDaoBoard | null;
  account?: string | null;
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
  const query = params.toString();
  return query ? `${APP_PROTOCOL_PATH}?${query}` : APP_PROTOCOL_PATH;
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

/** Public collection (drop) page. */
export function collectionPath(
  collectionId: string,
  opts?: { read?: boolean }
): string {
  const id = collectionId.trim();
  if (!id) return APP_MARKET_PATH;
  const base = `${APP_COLLECTION_PATH}/${encodeURIComponent(id)}`;
  if (!opts?.read) return base;
  return `${base}?${COLLECTION_READ_QUERY}=1`;
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
