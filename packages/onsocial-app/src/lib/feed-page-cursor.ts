/** Prefer keyset over offset when the page reports either cursor. */
export function feedPageHasMore(page: {
  nextOffset?: number;
  nextBeforeBlockHeight?: number;
}): boolean {
  return (
    page.nextBeforeBlockHeight !== undefined || page.nextOffset !== undefined
  );
}
