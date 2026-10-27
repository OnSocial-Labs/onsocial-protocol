/**
 * Session-scoped cache for decrypted DM media object URLs. Windowed thread
 * rows unmount when scrolled far away; without a cache each remount would
 * refetch and re-decrypt the blob and flash the placeholder. Entries are
 * bounded — evicting the least recently used revokes its URL.
 */
export class DmMediaObjectUrlCache {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();

  constructor(
    private readonly limit = 24,
    private readonly revoke: (url: string) => void = (url) =>
      URL.revokeObjectURL(url)
  ) {}

  /** Cached URL when present; otherwise `open` once and cache the result. */
  resolve(key: string, open: () => Promise<string>): Promise<string> {
    const cached = this.urls.get(key);
    if (cached) {
      this.urls.delete(key);
      this.urls.set(key, cached);
      return Promise.resolve(cached);
    }
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const request = open()
      .then((url) => {
        this.pending.delete(key);
        this.urls.set(key, url);
        this.evictOverflow();
        return url;
      })
      .catch((error: unknown) => {
        // Misses stay uncached so a later mount retries transient failures.
        this.pending.delete(key);
        throw error;
      });
    this.pending.set(key, request);
    return request;
  }

  private evictOverflow(): void {
    while (this.urls.size > this.limit) {
      const oldest = this.urls.keys().next();
      if (oldest.done) return;
      const url = this.urls.get(oldest.value);
      this.urls.delete(oldest.value);
      if (url) this.revoke(url);
    }
  }
}

export const dmMediaObjectUrls = new DmMediaObjectUrlCache();
