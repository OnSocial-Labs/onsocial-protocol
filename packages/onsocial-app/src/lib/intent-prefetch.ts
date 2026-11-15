/** Ignore pointer enters caused by a scroll moving links under the cursor. */
export const INTENT_PREFETCH_SCROLL_GUARD_MS = 150;

/** One screen of links. The next route, or a full set, starts a fresh window. */
export const INTENT_PREFETCH_SEEN_CAP = 64;

export type IntentPrefetchKind = 'pointerenter' | 'touchstart' | 'focus';

export type IntentPrefetchRequest = {
  href: string;
  base: string;
  /** Path plus search of the page already on screen. */
  current?: string;
  kind: IntentPrefetchKind;
  now: number;
  keyboard: boolean;
  /** `false` when the link opted out (`prefetch={false}`). */
  prefetch?: boolean;
};

type PrefetchFiber = {
  memoizedProps?: { prefetch?: boolean } | null;
  return?: PrefetchFiber | null;
};

/**
 * Next's Link consumes `prefetch={false}` and does not put it on the anchor.
 * The flag lives on the anchor props or the parent fiber.
 */
export function anchorPrefetchDisabled(anchor: {
  getAttribute(name: string): string | null;
  dataset?: { prefetch?: string };
}): boolean {
  if (anchor.getAttribute('prefetch') === 'false') return true;
  if (anchor.dataset?.prefetch === 'false') return true;
  const record = anchor as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!key.startsWith('__reactProps$')) continue;
    const props = record[key] as { prefetch?: boolean } | null;
    if (props?.prefetch === false) return true;
  }
  for (const key of Object.keys(record)) {
    if (!key.startsWith('__reactFiber$')) continue;
    let fiber = record[key] as PrefetchFiber | null;
    for (let depth = 0; fiber && depth < 8; depth += 1) {
      if (fiber.memoizedProps?.prefetch === false) return true;
      fiber = fiber.return ?? null;
    }
  }
  return false;
}

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
      if (input.prefetch === false) return false;
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
