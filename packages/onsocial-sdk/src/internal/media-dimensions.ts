// ---------------------------------------------------------------------------
// internal/media-dimensions — best-effort intrinsic size for a Blob/File.
//
// Renderer hints (`MediaRef.width` / `height`) let feeds reserve aspect-ratio
// boxes before the file arrives. Probing needs a DOM (Image / HTMLVideoElement
// + object URLs), so in Node or any non-browser runtime this resolves `{}` —
// uploads and post writes are never blocked on it, and it never rejects.
// ---------------------------------------------------------------------------

export interface MediaDimensions {
  width?: number;
  height?: number;
}

const PROBE_TIMEOUT_MS = 8_000;

function hasDom(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

function toDimensions(
  width: number | undefined,
  height: number | undefined
): MediaDimensions {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {};
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function probeImage(blob: Blob): Promise<MediaDimensions> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const settle = (dims: MediaDimensions) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    const timer = setTimeout(() => settle({}), PROBE_TIMEOUT_MS);
    img.onload = () =>
      settle(toDimensions(img.naturalWidth, img.naturalHeight));
    img.onerror = () => settle({});
    img.src = url;
  });
}

function probeVideo(blob: Blob): Promise<MediaDimensions> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    const settle = (dims: MediaDimensions) => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    const timer = setTimeout(() => settle({}), PROBE_TIMEOUT_MS);
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      settle(toDimensions(video.videoWidth, video.videoHeight));
    video.onerror = () => settle({});
    video.src = url;
  });
}

/**
 * Best-effort intrinsic pixel size of an image or video Blob. Returns `{}`
 * for non-visual media, undecodable files, timeouts, and non-browser
 * runtimes — callers treat missing hints as "unknown", never as failure.
 */
export function probeBlobDimensions(
  blob: Blob,
  mime: string
): Promise<MediaDimensions> {
  if (!hasDom()) return Promise.resolve({});
  const kind = (mime || '').toLowerCase();
  try {
    if (kind.startsWith('image/')) return probeImage(blob);
    if (kind.startsWith('video/')) return probeVideo(blob);
  } catch {
    // DOM exists but probing failed (e.g. createObjectURL revoked) — no hints.
  }
  return Promise.resolve({});
}
