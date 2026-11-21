/**
 * Prefer composite keyset when present. `nextOffset` is legacy for feeds that
 * still page by offset (saved, incomplete edges).
 */
export function feedPageHasMore(page: {
  nextOffset?: number;
  nextBeforeBlockHeight?: number;
}): boolean {
  return (
    page.nextBeforeBlockHeight !== undefined || page.nextOffset !== undefined
  );
}
