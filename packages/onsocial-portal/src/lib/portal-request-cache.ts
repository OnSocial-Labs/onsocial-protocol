type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/**
 * Short-lived in-process cache + in-flight dedupe for hot portal API paths.
 * Survives across requests in the same Node worker (not shared across replicas).
 */
export function createPortalRequestCache<T>(ttlMs: number, maxEntries = 400) {
  const entries = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function prune(): void {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (!oldest) break;
      entries.delete(oldest);
    }
  }

  return {
    async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now) {
        return cached.value;
      }

      const pending = inflight.get(key);
      if (pending) {
        return pending;
      }

      const promise = loader()
        .then((value) => {
          entries.set(key, { value, expiresAt: Date.now() + ttlMs });
          prune();
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });

      inflight.set(key, promise);
      return promise;
    },
  };
}

export function isRateLimitError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return /HTTP 429|rate limit/i.test(message);
}
