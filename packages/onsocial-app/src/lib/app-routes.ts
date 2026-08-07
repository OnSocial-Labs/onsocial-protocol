export const APP_HOME_PATH = '/home';
export const APP_DISCOVER_PATH = '/discover';
export const APP_GROUPS_PATH = '/groups';
export const APP_MARKET_PATH = '/market';
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

/** Public collection (drop) page. */
export function collectionPath(collectionId: string): string {
  const id = collectionId.trim();
  if (!id) return APP_MARKET_PATH;
  return `${APP_COLLECTION_PATH}/${encodeURIComponent(id)}`;
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
    pathname === APP_MARKET_PATH ||
    pathname.startsWith(`${APP_MARKET_PATH}/`) ||
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
