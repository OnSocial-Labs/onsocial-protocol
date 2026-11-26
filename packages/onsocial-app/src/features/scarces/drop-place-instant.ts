import { readCollectionCreatorFace } from '@/features/scarces/collection-creator-face-cache';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';
import type { CollectionView } from '@/features/scarces/collections-data';
import { readCollectionView } from '@/features/scarces/collection-view-cache';
import { editionTokenForCollection } from '@/features/scarces/collection-page-view';

/**
 * Set on the tap, before `router.push`, so the collection RSC can return
 * without rendering a second panel. Document loads ignore it.
 */
export const DROP_PLACE_INSTANT_COOKIE = 'os_drop_instant';

export type DropPlaceInstant = {
  collectionId: string;
  /** `/collection/id` — the pathname Next should commit. */
  pathname: string;
  /** Pathname still showing when the tap armed (Next has not committed). */
  fromPathname: string;
  editionToken: string | null;
  /** Next's pathname has caught up. Leaving that path clears the paint. */
  committed: boolean;
};

let current: DropPlaceInstant | null = null;
let snapshot: DropPlaceInstant | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = current;
  for (const listener of listeners) listener();
}

export function subscribeDropPlaceInstant(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Client snapshot. Stable until the next arm / commit / clear. */
export function getDropPlaceInstant(): DropPlaceInstant | null {
  return snapshot;
}

/** SSR / hydration: nothing is armed. The page paints the drop. */
export function getDropPlaceInstantServer(): null {
  return null;
}

function pathnameOf(href: string): string {
  const query = href.indexOf('?');
  const hash = href.indexOf('#');
  let end = href.length;
  if (query !== -1) end = query;
  if (hash !== -1 && hash < end) end = hash;
  return href.slice(0, end);
}

function editionFromHref(href: string, collectionId: string): string | null {
  const queryAt = href.indexOf('?');
  if (queryAt === -1) return null;
  const hash = href.indexOf('#', queryAt);
  const query = href.slice(queryAt + 1, hash === -1 ? undefined : hash);
  const token = new URLSearchParams(query).get('t');
  const edition = editionTokenForCollection(collectionId, token);
  return edition || null;
}

export function dropPlaceInstantCookieMatches(
  raw: string | null | undefined,
  collectionId: string
): boolean {
  if (raw == null || raw === '') return false;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  return value.trim() === collectionId.trim();
}

/**
 * Client navigations that already painted the drop must not render a second
 * panel when the RSC arrives. Hard refresh is a document request (no `rsc`).
 */
export function collectionRscDefersToInstantHost(opts: {
  rscHeader: string | null;
  cookie: string | null | undefined;
  collectionId: string;
}): boolean {
  if (opts.rscHeader !== '1') return false;
  return dropPlaceInstantCookieMatches(opts.cookie, opts.collectionId);
}

function writeDropPlaceInstantCookie(collectionId: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${DROP_PLACE_INSTANT_COOKIE}=${encodeURIComponent(collectionId)}; Path=/; Max-Age=30; SameSite=Lax`;
}

export function clearDropPlaceInstantCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${DROP_PLACE_INSTANT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function paintDropPlaceUrl(href: string): void {
  if (typeof window === 'undefined') return;
  const next = new URL(href, window.location.href);
  const target = next.pathname + next.search;
  const here = window.location.pathname + window.location.search;
  if (here === target) return;
  // `__NA` records the URL without Next restoring the previous tree.
  // The in-flight `router.push` replaceStates this entry when it commits,
  // so Dock Back is one hop.
  window.history.pushState({ __NA: true }, '', target);
}

/**
 * Card already in the view cache (cover, title, creator). Fans live in the
 * love cache `warmDropPlaceOpen` seeded. Null view → the panel's cold frame.
 */
export function instantDropFirstPaint(collectionId: string): {
  view: CollectionView | null;
  creator: CollectionCreatorFace | null;
} {
  const id = collectionId.trim();
  if (!id) return { view: null, creator: null };
  return {
    view: readCollectionView(id),
    creator: readCollectionCreatorFace(id),
  };
}

/** Synchronous. Call on the tap, before `router.push`. */
export function armDropPlaceInstant(input: {
  href: string;
  collectionId: string;
}): DropPlaceInstant | null {
  const collectionId = input.collectionId.trim();
  const href = input.href.trim();
  if (!collectionId || !href) return null;
  const fromPathname =
    typeof window !== 'undefined' ? window.location.pathname : '';
  paintDropPlaceUrl(href);
  writeDropPlaceInstantCookie(collectionId);
  current = {
    collectionId,
    pathname: pathnameOf(href),
    fromPathname,
    editionToken: editionFromHref(href, collectionId),
    committed: false,
  };
  emit();
  return current;
}

export function commitDropPlaceInstant(): void {
  if (!current || current.committed) return;
  current = { ...current, committed: true };
  emit();
}

export function clearDropPlaceInstant(): void {
  current = null;
  clearDropPlaceInstantCookie();
  emit();
}
