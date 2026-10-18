/** In-tab only. A hard refresh starts from the server again. */
export const CATALOG_PLACE_MEMORY_TTL_MS = 30 * 60 * 1000;

type ScrollEntry = {
  top: number;
  at: number;
};

const scrollByKey = new Map<string, ScrollEntry>();

export function clearCatalogPlaceMemory(): void {
  scrollByKey.clear();
}

export function peekPlaceScroll(key: string, now: number = Date.now()): number {
  const id = key.trim();
  if (!id) return 0;
  const hit = scrollByKey.get(id);
  if (!hit) return 0;
  if (now - hit.at > CATALOG_PLACE_MEMORY_TTL_MS) {
    scrollByKey.delete(id);
    return 0;
  }
  return hit.top;
}

export function writePlaceScroll(
  key: string,
  top: number,
  now: number = Date.now()
): void {
  const id = key.trim();
  if (!id) return;
  const line = Number.isFinite(top) ? Math.max(0, Math.round(top)) : 0;
  scrollByKey.set(id, { top: line, at: now });
}

/**
 * Quiet refresh replaces the first page and keeps rows the reader already
 * paged in. A successful empty page clears the list. A shorter current
 * list is just the new page.
 */
export function mergeCatalogHead<T>(
  current: readonly T[],
  page: readonly T[],
  keyOf: (item: T) => string
): T[] {
  if (page.length === 0) return [];
  if (current.length <= page.length) return [...page];
  const seen = new Set(page.map(keyOf));
  const tail = current.filter((item) => !seen.has(keyOf(item)));
  return [...page, ...tail];
}
