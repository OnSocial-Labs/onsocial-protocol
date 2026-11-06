import { logger } from '../../logger.js';

/** Resize rungs the feed and avatars actually request. */
export const IMAGE_VARIANT_WARM_WIDTHS = [128, 384, 1080] as const;

/** Preferred format first. Originals are not warmed — nothing to encode. */
const IMAGE_VARIANT_WARM_FORMATS = ['avif', 'webp'] as const;

/** How many warm-up fetches may run at once. */
export const IMAGE_VARIANT_WARM_CONCURRENCY = 3;

/**
 * Above the 20s resize read limit. A shorter abort drops the connection
 * before a cold resize finishes, so the edge never stores the response.
 */
export const IMAGE_VARIANT_WARM_TIMEOUT_MS = 25_000;

/**
 * Raster types the resize route actually shrinks. Gif and svg pass
 * through unchanged, so warming them does not help first paint.
 */
const WARMABLE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

/** Same CID allowlist as the storage routes — never interpolate a raw path. */
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,})$/;

const queue: Array<() => Promise<void>> = [];
let inFlight = 0;
let generation = 0;

function isWarmableImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return WARMABLE_IMAGE_MIMES.has(base);
}

export function imageVariantWarmUrls(
  gatewayBase: string,
  cid: string
): string[] {
  const root = gatewayBase
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/ipfs$/i, '');
  if (!root || !CID_PATTERN.test(cid)) return [];
  return IMAGE_VARIANT_WARM_FORMATS.flatMap((format) =>
    IMAGE_VARIANT_WARM_WIDTHS.map(
      (width) => `${root}/img/${width}/${format}/ipfs/${cid}`
    )
  );
}

function drain(): void {
  const gen = generation;
  while (inFlight < IMAGE_VARIANT_WARM_CONCURRENCY && queue.length > 0) {
    const task = queue.shift();
    if (!task) return;
    inFlight += 1;
    void task().finally(() => {
      if (gen !== generation) return;
      inFlight = Math.max(0, inFlight - 1);
      drain();
    });
  }
}

function warmTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  timer.unref();
  return controller.signal;
}

async function warmOne(url: string, fetchImpl: typeof fetch): Promise<void> {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: warmTimeoutSignal(IMAGE_VARIANT_WARM_TIMEOUT_MS),
    });
    await response.arrayBuffer().catch(() => undefined);
    if (!response.ok) {
      logger.warn(
        { url, status: response.status },
        'Image variant warm-up failed'
      );
    }
  } catch (error) {
    logger.warn({ err: error, url }, 'Image variant warm-up failed');
  }
}

/**
 * Fire-and-forget GETs for the common resize sizes of a newly stored image.
 * Never throws and never blocks the upload response.
 */
export function scheduleImageVariantWarmup(input: {
  cid: string;
  mime?: string | null;
  gatewayBase: string;
  fetchImpl?: typeof fetch;
}): void {
  try {
    const cid = input.cid.trim();
    if (!isWarmableImageMime(input.mime)) return;
    const urls = imageVariantWarmUrls(input.gatewayBase, cid);
    if (urls.length === 0) return;
    const fetchImpl = input.fetchImpl ?? fetch;
    for (const url of urls) {
      queue.push(() => warmOne(url, fetchImpl));
    }
    drain();
  } catch (error) {
    logger.warn({ err: error }, 'Image variant warm-up failed');
  }
}

/** Test-only. Drops queued work so cases do not share in-flight slots. */
export function resetImageVariantWarmupForTests(): void {
  generation += 1;
  queue.length = 0;
  inFlight = 0;
}
