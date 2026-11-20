import { FeedWindowSizeCache } from '@/features/home/feed-window';

/**
 * SPA-lifetime reply height caches keyed by root path. Reopening a thread
 * (or remounting a trail panel) reuses measured row heights so spacers do
 * not snap from estimates. Cap matches {@link thread-session-cache}.
 */
const MAX_ENTRIES = 15;
const caches = new Map<string, FeedWindowSizeCache>();

export function threadWindowSizeCache(rootPath: string): FeedWindowSizeCache {
  const key = rootPath.trim();
  if (!key) return new FeedWindowSizeCache();
  const existing = caches.get(key);
  if (existing) {
    caches.delete(key);
    caches.set(key, existing);
    return existing;
  }
  const created = new FeedWindowSizeCache();
  caches.set(key, created);
  while (caches.size > MAX_ENTRIES) {
    const oldest = caches.keys().next().value;
    if (oldest == null) break;
    caches.delete(oldest);
  }
  return created;
}

/** Test hook — module state must not leak between specs. */
export function clearThreadWindowSizeCaches(): void {
  caches.clear();
}
