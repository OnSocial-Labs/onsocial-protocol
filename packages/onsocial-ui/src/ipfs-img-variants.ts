/**
 * IPFS image variants served by the CDN imgproxy route (image-variants
 * phase 1 infra): `https://cdn[.testnet].onsocial.id/img/<width>/ipfs/<cid>`.
 *
 * Widths are locked server-side — the Caddy route only matches these four,
 * and imgproxy passes gif/svg through byte-identical, so a variant URL is
 * safe for any image format. The original `/ipfs/<cid>` URL stays the
 * canonical (on-chain) reference; variants are derived render-time only.
 */
export const IPFS_IMG_VARIANT_WIDTHS = [128, 384, 1080, 1920] as const;

export type IpfsImgVariantWidth = (typeof IPFS_IMG_VARIANT_WIDTHS)[number];

/**
 * Formats imgproxy serves byte-identical from source (D3). A variant URL
 * would work but adds a resize hop for zero benefit — bypass it.
 */
const PASSTHROUGH_MIMES = new Set(['image/gif', 'image/svg+xml']);

function isPassthroughMime(mime: string | null | undefined): boolean {
  return mime ? PASSTHROUGH_MIMES.has(mime.trim().toLowerCase()) : false;
}

/**
 * Root CIDs plus variation seat art (`…/ipfs/<cid>/3.png`) — the CDN route
 * matches exactly these two forms (g9). Seat stems are strictly numeric
 * with an image extension, mirroring the route's allowlist; queries,
 * foreign hosts, and other subpaths still bypass.
 */
const CDN_IPFS_URL =
  /^https:\/\/(cdn(?:\.testnet)?\.onsocial\.id)\/ipfs\/([A-Za-z0-9]+)(\/[0-9]+\.(?:png|jpe?g|webp|gif|svg))?$/i;

function splitCdnIpfsUrl(
  url: string | null | undefined
): { host: string; cid: string; seatPath: string } | null {
  const match = url ? CDN_IPFS_URL.exec(url.trim()) : null;
  if (!match) return null;
  return { host: match[1]!, cid: match[2]!, seatPath: match[3] ?? '' };
}

/** True when the URL is one of our CDN IPFS originals that can be resized. */
export function isCdnIpfsImgUrl(url: string | null | undefined): boolean {
  return splitCdnIpfsUrl(url) !== null;
}

/**
 * Variant URL for one locked width, or `null` when the URL is not a CDN
 * IPFS original (blob previews, external hosts, non-seat subpaths) or the
 * MIME is pass-through (gif/svg, D3) — callers fall back to the original
 * `src` with no `srcSet`.
 */
export function ipfsImgVariantUrl(
  url: string | null | undefined,
  width: IpfsImgVariantWidth,
  mime?: string | null
): string | null {
  const parts = splitCdnIpfsUrl(url);
  if (!parts || isPassthroughMime(mime)) return null;
  return `https://${parts.host}/img/${width}/ipfs/${parts.cid}${parts.seatPath}`;
}

/**
 * `srcSet` value across the locked widths (`"… 128w, … 384w, …"`), or
 * `undefined` when variants do not apply. Pair with a `sizes` attribute
 * that reflects the rendered slot so the browser picks the right rung.
 */
export function ipfsImgSrcSet(
  url: string | null | undefined,
  widths: readonly IpfsImgVariantWidth[] = IPFS_IMG_VARIANT_WIDTHS,
  mime?: string | null
): string | undefined {
  if (!splitCdnIpfsUrl(url) || isPassthroughMime(mime)) return undefined;
  return widths
    .map((width) => `${ipfsImgVariantUrl(url, width)} ${width}w`)
    .join(', ');
}
