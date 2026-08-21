import { APP_HOME_PATH } from '@/lib/app-routes';

/** Place tags on posts — intentional city / venue / event slugs (not GPS). */

export const PLACE_MAX_LENGTH = 64;
export const PLACE_MAX_PER_POST = 1;
export const PLACE_SLUG_RE = /^[a-z0-9_]{1,64}$/;

/** Query key for Home place filter (`/home?place=lisbon`). */
export const HOME_PLACE_QUERY_KEY = 'place';

/** Normalize raw input into a place slug. Returns null if empty/invalid. */
export function normalizePlaceSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, PLACE_MAX_LENGTH);
  if (!slug || !PLACE_SLUG_RE.test(slug)) return null;
  return slug;
}

/** Cap + dedupe place list for PostV1 `places[]`. */
export function normalizePlaceList(
  raw: unknown,
  max: number = PLACE_MAX_PER_POST
): string[] {
  if (!Array.isArray(raw)) {
    const single = normalizePlaceSlug(raw);
    return single ? [single] : [];
  }
  const out: string[] = [];
  for (const item of raw) {
    const slug = normalizePlaceSlug(item);
    if (!slug || out.includes(slug)) continue;
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

export function placesMetaFromComposer(places?: string[] | string | null): {
  places?: string[];
} {
  const list = normalizePlaceList(places);
  return list.length > 0 ? { places: list } : {};
}

/** Display label — `lisbon` → `Lisbon`, `eth_denver` → `Eth denver`. */
export function placeLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const words = slug.split('_').filter(Boolean).join(' ');
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export function isValidPlaceSlug(slug: string): boolean {
  return PLACE_SLUG_RE.test(slug);
}

export function homePlacePath(place: string): string {
  const slug = normalizePlaceSlug(place);
  if (!slug) return APP_HOME_PATH;
  return `${APP_HOME_PATH}?${HOME_PLACE_QUERY_KEY}=${encodeURIComponent(slug)}`;
}

export function parseHomePlaceParam(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  return normalizePlaceSlug(raw);
}

export function homePlaceEmptyCopy(place: string): string {
  const label = placeLabel(place) ?? place;
  return `No posts at ${label} yet.`;
}
