/** Ignore pointer enters caused by a scroll moving links under the cursor. */
export const INTENT_PREFETCH_SCROLL_GUARD_MS = 150;

/** One screen of links. The next route, or a full set, starts a fresh window. */
export const INTENT_PREFETCH_SEEN_CAP = 64;

/**
 * Pathname of this document, read on the first client call.
 * Null on the server. A hard load stays on this path; a later client
 * navigation — including a return to it — is something else.
 */
let documentEntryPathname: string | null | undefined;
/** True after this document has shown a path other than the entry. */
let documentHasLeftEntry = false;

export function readDocumentEntryPathname(): string | null {
  if (documentEntryPathname === undefined) {
    documentEntryPathname =
      typeof window === 'undefined' ? null : window.location.pathname;
  }
  return documentEntryPathname;
}

export function readDocumentHasLeftEntry(): boolean {
  return documentHasLeftEntry;
}

export function noteDocumentLeftEntry(): void {
  documentHasLeftEntry = true;
}

/** Tests start each case before the first client read. */
export function resetDocumentRouteForTests(): void {
  documentEntryPathname = undefined;
  documentHasLeftEntry = false;
}

export type IntentPrefetchKind = 'pointerenter' | 'touchstart' | 'focus';

export type IntentPrefetchRequest = {
  href: string;
  base: string;
  /** Path plus search of the page already on screen. */
  current?: string;
  kind: IntentPrefetchKind;
  now: number;
  keyboard: boolean;
};

/**
 * Same-origin path a hover, touch, or keyboard focus may prefetch.
 * Hash-only and off-site hrefs are not app routes.
 */
export function intentPrefetchKey(href: string, base: string): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith('#')) return null;
  let here: URL;
  let url: URL;
  try {
    here = new URL(base);
    url = new URL(raw, here);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== here.origin) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * One prefetch per href. Pointer focus and scroll-driven enters do not count.
 * A rejected enter does not consume the href.
 */
export function createIntentPrefetchSession(prefetch: (href: string) => void) {
  const seen = new Set<string>();
  let scrolledAt = Number.NEGATIVE_INFINITY;
  let route: string | null = null;

  return {
    noteScroll(now: number) {
      scrolledAt = now;
    },
    request(input: IntentPrefetchRequest): boolean {
      if (input.kind === 'focus' && !input.keyboard) return false;
      if (
        input.kind === 'pointerenter' &&
        input.now - scrolledAt < INTENT_PREFETCH_SCROLL_GUARD_MS
      ) {
        return false;
      }
      const routeKey = input.current ?? '';
      if (route !== null && route !== routeKey) seen.clear();
      route = routeKey;
      const key = intentPrefetchKey(input.href, input.base);
      if (!key || key === routeKey || seen.has(key)) return false;
      if (seen.size >= INTENT_PREFETCH_SEEN_CAP) seen.clear();
      seen.add(key);
      prefetch(key);
      return true;
    },
  };
}
