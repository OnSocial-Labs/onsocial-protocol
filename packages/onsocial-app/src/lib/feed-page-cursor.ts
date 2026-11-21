/**
 * Chrono / Pulse / Hot feed pages: more to load only when the composite
 * keyset is complete. Bare height or soft-deprecated `nextOffset` is not
 * enough — incomplete edges end the walk (match SDK).
 */
export function feedPageHasMore(page: {
  nextBeforeBlockHeight?: number;
  nextBeforeEventKey?: string;
  /** Ignored — feed pages no longer mint offset cursors. */
  nextOffset?: number;
}): boolean {
  const key = page.nextBeforeEventKey?.trim();
  return page.nextBeforeBlockHeight !== undefined && Boolean(key);
}
