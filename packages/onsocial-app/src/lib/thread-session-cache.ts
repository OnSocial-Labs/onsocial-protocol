import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

export interface ThreadSessionSnapshot extends PersonalPostPageData {
  fetchedAt: number;
}

/*
 * Stale-while-revalidate thread store. Opening a post from the feed seeds
 * the sheet with the tapped row (root paints instantly) but replies always
 * waited on the network — every open, even one seconds after the last.
 * Keeping the last fetched tree per thread lets a re-open paint replies
 * immediately while the background refresh replaces them, the same
 * session-cached detail view X / Reddit ship. Module scope = SPA lifetime;
 * a real page reload falls back to the normal fetch path.
 */
const MAX_ENTRIES = 15;

const cache = new Map<string, ThreadSessionSnapshot>();

export function readThreadSession(
  rootPath: string
): ThreadSessionSnapshot | null {
  const hit = cache.get(rootPath);
  if (!hit) return null;
  // Touch — Map iteration order is insertion order, so re-insert on read
  // to keep genuinely recent threads from being evicted by one-off opens.
  cache.delete(rootPath);
  cache.set(rootPath, hit);
  return hit;
}

export function writeThreadSession(
  rootPath: string,
  data: PersonalPostPageData
): void {
  cache.delete(rootPath);
  cache.set(rootPath, { ...data, fetchedAt: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

/** Test hook — module state must not leak between specs. */
export function clearThreadSessionCache(): void {
  cache.clear();
}
