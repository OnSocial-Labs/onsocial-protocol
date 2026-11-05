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

/**
 * Gap before the single retry of a failed variant. Long enough to leave
 * the failed response, short enough that the fallback still feels immediate.
 */
export const IPFS_IMG_RETRY_DELAY_MS = 300;

/** `/img/<width>/ipfs/<cid>` and optional variation seat, same hosts as originals. */
const CDN_IMG_VARIANT_URL =
  /^https:\/\/(cdn(?:\.testnet)?\.onsocial\.id)\/img\/(128|384|1080|1920)\/ipfs\/([A-Za-z0-9]+)(\/[0-9]+\.(?:png|jpe?g|webp|gif|svg))?$/i;

export type IpfsImgLoadPhase = 'primary' | 'retry' | 'fallback' | 'exhausted';

export interface IpfsImgLoadState {
  phase: IpfsImgLoadPhase;
  src: string;
  srcSet?: string;
  /**
   * When non-zero, a retry is scheduled and `src` must not be painted yet
   * so the element drops the failed URL before requesting it again.
   */
  waitMs: number;
}

export function ipfsImgLoadState(
  src: string | null | undefined,
  srcSet?: string
): IpfsImgLoadState {
  return {
    phase: 'primary',
    src: src?.trim() ?? '',
    srcSet: srcSet || undefined,
    waitMs: 0,
  };
}

/** True for a CDN variant URL (`/img/<width>/ipfs/...`), not the byte original. */
export function isIpfsImgVariantUrl(url: string | null | undefined): boolean {
  return Boolean(url && CDN_IMG_VARIANT_URL.test(url.trim()));
}

/**
 * Byte-original `/ipfs/<cid>` URL for a CDN original or a variant of it.
 * Seat art keeps its suffix. Anything else returns null.
 */
export function ipfsImgOriginalUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const variant = CDN_IMG_VARIANT_URL.exec(trimmed);
  if (variant) {
    return `https://${variant[1]}/ipfs/${variant[3]}${variant[4] ?? ''}`;
  }
  const original = CDN_IPFS_URL.exec(trimmed);
  if (!original) return null;
  return `https://${original[1]}/ipfs/${original[2]}${original[3] ?? ''}`;
}

function exhaustedIpfsImgLoad(state: IpfsImgLoadState): IpfsImgLoadState {
  if (
    state.phase === 'exhausted' &&
    state.srcSet === undefined &&
    state.waitMs === 0
  ) {
    return state;
  }
  return {
    phase: 'exhausted',
    src: state.src,
    srcSet: undefined,
    waitMs: 0,
  };
}

/**
 * Next image load after an element error.
 *
 * A variant failure (or any failure while a variant srcSet is set) retries
 * once, after `waitMs`. When the element reports the variant URL, that exact
 * URL is retried; otherwise the same src and srcSet are requested again.
 * The retry failure falls back to the original `/ipfs/<cid>` URL and drops
 * srcSet. A failure of that original, or of a URL that was never a variant,
 * stops. Errors while a retry is waiting, and any error after stop, are
 * ignored so the load cannot cycle.
 */
export function nextIpfsImgLoadOnError(
  state: IpfsImgLoadState,
  failedSrc: string,
  requestedSrc: string | null | undefined
): IpfsImgLoadState {
  if (state.phase === 'exhausted' || state.waitMs > 0) return state;

  const failed = failedSrc.trim();
  const original =
    ipfsImgOriginalUrl(requestedSrc) ??
    (failed ? ipfsImgOriginalUrl(failed) : null) ??
    ipfsImgOriginalUrl(state.src);
  const failedIsVariant = Boolean(failed) && isIpfsImgVariantUrl(failed);
  const variantAttempt =
    Boolean(state.srcSet) || failedIsVariant || isIpfsImgVariantUrl(state.src);

  if (state.phase === 'primary') {
    if (!variantAttempt) {
      if (!failed) return state;
      return exhaustedIpfsImgLoad(state);
    }
    if (failedIsVariant) {
      return {
        phase: 'retry',
        src: failed,
        srcSet: undefined,
        waitMs: IPFS_IMG_RETRY_DELAY_MS,
      };
    }
    return {
      phase: 'retry',
      src: state.src,
      srcSet: state.srcSet,
      waitMs: IPFS_IMG_RETRY_DELAY_MS,
    };
  }

  if (state.phase === 'retry') {
    if (original && (state.src !== original || state.srcSet)) {
      return {
        phase: 'fallback',
        src: original,
        srcSet: undefined,
        waitMs: 0,
      };
    }
    return exhaustedIpfsImgLoad(state);
  }

  return exhaustedIpfsImgLoad(state);
}
