/**
 * Cold Market home (empty list only) — hold the page skeleton until the
 * primary catalog batch settles: browse listings, sales payload, and Yours
 * when a wallet is in play.
 *
 * Sale faces and Your offers are secondary seats (section skeleton / soft
 * fill). They must not gate the page skeleton — that over-waits and can
 * stick loading if a secondary fetch never resolves.
 */
export function marketBrowseColdPending(opts: {
  listingsReady: boolean;
  salesSettled: boolean;
  ownedSettled: boolean;
}): boolean {
  if (!opts.listingsReady) return true;
  if (!opts.salesSettled) return true;
  if (!opts.ownedSettled) return true;
  return false;
}
