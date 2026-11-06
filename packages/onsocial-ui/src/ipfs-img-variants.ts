/**
 * IPFS image variants served by the CDN resize route:
 * `https://cdn[.testnet].onsocial.id/img/<width>/ipfs/<cid>` is always the
 * original format. `…/img/<width>/<avif|webp>/ipfs/<cid>` is that one
 * format and nothing else — the edge cache keys on the URL and ignores
 * Accept, so a URL must not change type between visitors.
 *
 * Widths are locked server-side — the route only matches these four,
 * and gif/svg pass through byte-identical, so a variant URL is safe for
 * any image format. The original `/ipfs/<cid>` URL stays the canonical
 * (on-chain) reference; variants are derived render-time only.
 */
export const IPFS_IMG_VARIANT_WIDTHS = [128, 384, 1080, 1920] as const;

/** Resized formats a URL can name. Order is the picture cascade. */
export const IPFS_IMG_OUTPUT_FORMATS = ['avif', 'webp'] as const;

export type IpfsImgOutputFormat = (typeof IPFS_IMG_OUTPUT_FORMATS)[number];

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
function formatSegment(format?: IpfsImgOutputFormat | null): string {
  return format === 'avif' || format === 'webp' ? `/${format}` : '';
}

export function ipfsImgVariantUrl(
  url: string | null | undefined,
  width: IpfsImgVariantWidth,
  mime?: string | null,
  format?: IpfsImgOutputFormat | null
): string | null {
  const parts = splitCdnIpfsUrl(url);
  if (!parts || isPassthroughMime(mime)) return null;
  return `https://${parts.host}/img/${width}${formatSegment(format)}/ipfs/${parts.cid}${parts.seatPath}`;
}

/**
 * `srcSet` value across the locked widths (`"… 128w, … 384w, …"`), or
 * `undefined` when variants do not apply. Pair with a `sizes` attribute
 * that reflects the rendered slot so the browser picks the right rung.
 */
export function ipfsImgSrcSet(
  url: string | null | undefined,
  widths: readonly IpfsImgVariantWidth[] = IPFS_IMG_VARIANT_WIDTHS,
  mime?: string | null,
  format?: IpfsImgOutputFormat | null
): string | undefined {
  if (!splitCdnIpfsUrl(url) || isPassthroughMime(mime)) return undefined;
  return widths
    .map((width) => `${ipfsImgVariantUrl(url, width, mime, format)} ${width}w`)
    .join(', ');
}

/**
 * Gap before the single retry of a failed variant. Long enough to leave
 * the failed response, short enough that the fallback still feels immediate.
 */
export const IPFS_IMG_RETRY_DELAY_MS = 300;

/**
 * `/img/<width>/ipfs/<cid>` and `/img/<width>/<avif|webp>/ipfs/<cid>`,
 * plus an optional variation seat. Same hosts as originals.
 */
const CDN_IMG_VARIANT_URL =
  /^https:\/\/(cdn(?:\.testnet)?\.onsocial\.id)\/img\/(128|384|1080|1920)(?:\/(?:avif|webp))?\/ipfs\/([A-Za-z0-9]+)(\/[0-9]+\.(?:png|jpe?g|webp|gif|svg))?$/i;

export type IpfsImgLoadPhase = 'primary' | 'retry' | 'fallback' | 'exhausted';

export interface IpfsImgLoadState {
  phase: IpfsImgLoadPhase;
  src: string;
  /** Original-format resized candidates. Omitted once a format URL is retried. */
  srcSet?: string;
  /** Present only on the first attempt, ahead of webp and the original. */
  avifSrcSet?: string;
  webpSrcSet?: string;
  /**
   * When non-zero, a retry is scheduled and `src` must not be painted yet
   * so the element drops the failed URL before requesting it again.
   */
  waitMs: number;
}

function widthsForRequest(src: string, srcSet?: string): IpfsImgVariantWidth[] {
  const haystack = srcSet ? srcSet : src;
  const widths: IpfsImgVariantWidth[] = [];
  const pattern = /\/img\/(128|384|1080|1920)(?:\/(?:avif|webp))?\/ipfs\//g;
  for (const match of haystack.matchAll(pattern)) {
    const width = Number(match[1]) as IpfsImgVariantWidth;
    if (!widths.includes(width)) widths.push(width);
  }
  return widths;
}

function pictureSources(
  src: string,
  srcSet?: string
): Pick<IpfsImgLoadState, 'avifSrcSet' | 'webpSrcSet'> {
  const widths = widthsForRequest(src, srcSet);
  if (widths.length === 0) return {};
  const root = ipfsImgOriginalUrl(src);
  if (!root) return {};
  return {
    avifSrcSet: ipfsImgSrcSet(root, widths, undefined, 'avif'),
    webpSrcSet: ipfsImgSrcSet(root, widths, undefined, 'webp'),
  };
}

export function ipfsImgLoadState(
  src: string | null | undefined,
  srcSet?: string,
  mime?: string | null
): IpfsImgLoadState {
  const trimmed = src?.trim() ?? '';
  if (isPassthroughMime(mime)) {
    return {
      phase: 'primary',
      src: trimmed,
      srcSet: undefined,
      waitMs: 0,
    };
  }
  const normalizedSrcSet = srcSet || undefined;
  return {
    phase: 'primary',
    src: trimmed,
    srcSet: normalizedSrcSet,
    ...pictureSources(trimmed, normalizedSrcSet),
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
    state.avifSrcSet === undefined &&
    state.webpSrcSet === undefined &&
    state.waitMs === 0
  ) {
    return state;
  }
  return {
    phase: 'exhausted',
    src: state.src,
    srcSet: undefined,
    avifSrcSet: undefined,
    webpSrcSet: undefined,
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
    Boolean(state.srcSet) ||
    Boolean(state.avifSrcSet) ||
    Boolean(state.webpSrcSet) ||
    failedIsVariant ||
    isIpfsImgVariantUrl(state.src);

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
        avifSrcSet: undefined,
        webpSrcSet: undefined,
        waitMs: IPFS_IMG_RETRY_DELAY_MS,
      };
    }
    return {
      phase: 'retry',
      src: state.src,
      srcSet: state.srcSet,
      avifSrcSet: state.avifSrcSet,
      webpSrcSet: state.webpSrcSet,
      waitMs: IPFS_IMG_RETRY_DELAY_MS,
    };
  }

  if (state.phase === 'retry') {
    if (
      original &&
      (state.src !== original ||
        state.srcSet ||
        state.avifSrcSet ||
        state.webpSrcSet)
    ) {
      return {
        phase: 'fallback',
        src: original,
        srcSet: undefined,
        avifSrcSet: undefined,
        webpSrcSet: undefined,
        waitMs: 0,
      };
    }
    return exhaustedIpfsImgLoad(state);
  }

  return exhaustedIpfsImgLoad(state);
}
