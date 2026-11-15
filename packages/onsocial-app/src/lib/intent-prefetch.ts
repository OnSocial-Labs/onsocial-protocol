/** Ignore pointer enters caused by a scroll moving links under the cursor. */
export const INTENT_PREFETCH_SCROLL_GUARD_MS = 150;

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
  return `${url.pathname}${url.search}`;
}

/**
 * One prefetch per href. Pointer focus and scroll-driven enters do not count.
 * A rejected enter does not consume the href.
 */
export function createIntentPrefetchSession(prefetch: (href: string) => void) {
  const seen = new Set<string>();
  let scrolledAt = Number.NEGATIVE_INFINITY;

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
      const key = intentPrefetchKey(input.href, input.base);
      if (!key || key === input.current || seen.has(key)) return false;
      seen.add(key);
      prefetch(key);
      return true;
    },
  };
}
