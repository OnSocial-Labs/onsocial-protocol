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

/** Root CIDs only — the CDN route does not match subpaths, queries, or CID-in-path forms. */
const CDN_IPFS_URL =
  /^https:\/\/(cdn(?:\.testnet)?\.onsocial\.id)\/ipfs\/([A-Za-z0-9]+)$/;

function splitCdnIpfsUrl(
  url: string | null | undefined
): { host: string; cid: string } | null {
  const match = url ? CDN_IPFS_URL.exec(url.trim()) : null;
  if (!match) return null;
  return { host: match[1]!, cid: match[2]! };
}

/** True when the URL is one of our CDN IPFS originals that can be resized. */
export function isCdnIpfsImgUrl(url: string | null | undefined): boolean {
  return splitCdnIpfsUrl(url) !== null;
}

/**
 * Variant URL for one locked width, or `null` when the URL is not a CDN
 * IPFS original (blob previews, external hosts, subpaths) — callers fall
 * back to the original `src` with no `srcSet`.
 */
export function ipfsImgVariantUrl(
  url: string | null | undefined,
  width: IpfsImgVariantWidth
): string | null {
  const parts = splitCdnIpfsUrl(url);
  if (!parts) return null;
  return `https://${parts.host}/img/${width}/ipfs/${parts.cid}`;
}

/**
 * `srcSet` value across the locked widths (`"… 128w, … 384w, …"`), or
 * `undefined` when variants do not apply. Pair with a `sizes` attribute
 * that reflects the rendered slot so the browser picks the right rung.
 */
export function ipfsImgSrcSet(
  url: string | null | undefined,
  widths: readonly IpfsImgVariantWidth[] = IPFS_IMG_VARIANT_WIDTHS
): string | undefined {
  if (!splitCdnIpfsUrl(url)) return undefined;
  return widths
    .map((width) => `${ipfsImgVariantUrl(url, width)} ${width}w`)
    .join(', ');
}
