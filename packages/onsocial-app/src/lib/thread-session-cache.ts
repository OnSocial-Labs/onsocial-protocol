import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

export interface ThreadSessionSnapshot extends PersonalPostPageData {
  fetchedAt: number;
}

export interface GuildThreadSessionSnapshot extends GuildPostPageData {
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

function createThreadSessionCache<TData>() {
  const cache = new Map<string, TData & { fetchedAt: number }>();

  return {
    read(rootPath: string): (TData & { fetchedAt: number }) | null {
      const hit = cache.get(rootPath);
      if (!hit) return null;
      // Touch — Map iteration order is insertion order, so re-insert on read
      // to keep genuinely recent threads from being evicted by one-off opens.
      cache.delete(rootPath);
      cache.set(rootPath, hit);
      return hit;
    },

    write(rootPath: string, data: TData): void {
      cache.delete(rootPath);
      cache.set(rootPath, { ...data, fetchedAt: Date.now() });
      while (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest == null) break;
        cache.delete(oldest);
      }
    },

    /** Test hook — module state must not leak between specs. */
    clear(): void {
      cache.clear();
    },
  };
}

const personalCache = createThreadSessionCache<PersonalPostPageData>();
const guildCache = createThreadSessionCache<GuildPostPageData>();

export function readThreadSession(
  rootPath: string
): ThreadSessionSnapshot | null {
  return personalCache.read(rootPath);
}

export function writeThreadSession(
  rootPath: string,
  data: PersonalPostPageData
): void {
  personalCache.write(rootPath, data);
}

/** Test hook — module state must not leak between specs. */
export function clearThreadSessionCache(): void {
  personalCache.clear();
}

export function readGuildThreadSession(
  rootPath: string
): GuildThreadSessionSnapshot | null {
  return guildCache.read(rootPath);
}

export function writeGuildThreadSession(
  rootPath: string,
  data: GuildPostPageData
): void {
  guildCache.write(rootPath, data);
}

/** Test hook — module state must not leak between specs. */
export function clearGuildThreadSessionCache(): void {
  guildCache.clear();
}
