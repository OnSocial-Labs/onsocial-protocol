/** Default network map sample (counts + orbit preview rows). */
export const PORTAL_NETWORK_SAMPLE_REVALIDATE_SECONDS = 60;

/** Network map search responses (q + filter). */
export const PORTAL_NETWORK_SEARCH_REVALIDATE_SECONDS = 30;

export function portalPublicCacheControl(
  revalidateSeconds: number,
  staleMultiplier = 2
): string {
  const stale = revalidateSeconds * staleMultiplier;
  return `public, s-maxage=${revalidateSeconds}, stale-while-revalidate=${stale}`;
}

export function portalPrivateCacheControl(
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds: number
): string {
  return `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
}
