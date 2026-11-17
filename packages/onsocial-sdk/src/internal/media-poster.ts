// ---------------------------------------------------------------------------
// internal/media-poster — best-effort still frame from a video Blob.
//
// Uploaded beside the video as MediaRef.poster so feeds can paint a stand-in
// before the decoder mounts. Browser-only; never rejects — missing poster
// is fine (renderer keeps the shimmer / reserved seat).
// ---------------------------------------------------------------------------

const POSTER_TIMEOUT_MS = 8_000;
const POSTER_MAX_EDGE = 1280;
const POSTER_SEEK_CAP_SECONDS = 1;

function hasDom(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

function defaultSeekSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration / 2, POSTER_SEEK_CAP_SECONDS);
}

/**
 * Grab a JPEG still from a video Blob. Returns `null` when the runtime
 * cannot decode, the canvas is tainted, or the probe times out.
 */
export function captureBlobVideoPoster(blob: Blob): Promise<Blob | null> {
  if (!hasDom()) return Promise.resolve(null);
  const mime = (blob.type || '').toLowerCase();
  if (!mime.startsWith('video/')) return Promise.resolve(null);

  return new Promise((resolve) => {
    // Never reject — a throw here used to orphan the video upload (Promise.all).
    try {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      let settled = false;
      const settle = (value: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        resolve(value);
      };
      const timer = setTimeout(() => settle(null), POSTER_TIMEOUT_MS);

      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onerror = () => settle(null);
      video.onloadedmetadata = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          settle(null);
          return;
        }
        const seekTo = defaultSeekSeconds(video.duration);
        const grab = () => {
          try {
            const scale = Math.min(
              1,
              POSTER_MAX_EDGE / Math.max(width, height)
            );
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext('2d');
            if (!context) {
              settle(null);
              return;
            }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((frame) => settle(frame), 'image/jpeg', 0.85);
          } catch {
            settle(null);
          }
        };
        if (seekTo <= 0) {
          grab();
          return;
        }
        video.onseeked = () => grab();
        try {
          video.currentTime = seekTo;
        } catch {
          grab();
        }
      };
      video.src = url;
    } catch {
      resolve(null);
    }
  });
}
