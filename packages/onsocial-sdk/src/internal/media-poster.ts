// ---------------------------------------------------------------------------
// internal/media-poster — best-effort still frame from a video Blob.
//
// Uploaded beside the video as MediaRef.poster so feeds can paint a stand-in
// before the decoder mounts. Browser-only; never rejects — missing poster
// is fine (renderer keeps the shimmer / reserved seat).
// ---------------------------------------------------------------------------

import { videoMimeForBlob } from './video-mime.js';

const POSTER_TIMEOUT_MS = 8_000;
const POSTER_SEEK_TIMEOUT_MS = 1_500;
const POSTER_MAX_EDGE = 1280;
const POSTER_SEEK_CAP_SECONDS = 1;
const HAVE_CURRENT_DATA = 2;

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
 * A hung seek falls back to t=0 / the current decoded frame.
 */
export function captureBlobVideoPoster(blob: Blob): Promise<Blob | null> {
  if (!hasDom()) return Promise.resolve(null);
  if (!videoMimeForBlob(blob)) return Promise.resolve(null);

  return new Promise((resolve) => {
    // Never reject — a throw here used to orphan the video upload (Promise.all).
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(blob);
      const video = document.createElement('video');
      let settled = false;
      let seekTimer: ReturnType<typeof setTimeout> | undefined;
      let frameListener: (() => void) | undefined;
      const unlistenFrame = () => {
        if (!frameListener) return;
        video.removeEventListener('loadeddata', frameListener);
        video.removeEventListener('seeked', frameListener);
        video.removeEventListener('canplay', frameListener);
        frameListener = undefined;
      };
      const settle = (value: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (seekTimer) clearTimeout(seekTimer);
        unlistenFrame();
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        resolve(value);
      };
      const timer = setTimeout(() => settle(null), POSTER_TIMEOUT_MS);

      const grab = () => {
        try {
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) {
            settle(null);
            return;
          }
          const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
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

      const grabDecoded = () => {
        try {
          if (video.readyState >= HAVE_CURRENT_DATA) {
            grab();
            return;
          }
          // A hung seek leaves readyState at HAVE_METADATA. loadeddata already
          // fired for the first load and will not fire again; seeked/canplay
          // do, after the fallback seek to t=0.
          unlistenFrame();
          frameListener = () => {
            unlistenFrame();
            grab();
          };
          video.addEventListener('loadeddata', frameListener);
          video.addEventListener('seeked', frameListener);
          video.addEventListener('canplay', frameListener);
        } catch {
          settle(null);
        }
      };

      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onerror = () => settle(null);
      video.onloadedmetadata = () => {
        if (!video.videoWidth || !video.videoHeight) {
          settle(null);
          return;
        }
        const seekTo = defaultSeekSeconds(video.duration);
        if (seekTo <= 0) {
          grabDecoded();
          return;
        }
        const fallback = () => {
          video.onseeked = null;
          // Listen before the fallback seek so a synchronous seeked/canplay
          // is not missed, and so a later event still arrives while readyState
          // is only HAVE_METADATA.
          grabDecoded();
          try {
            if (video.currentTime !== 0) video.currentTime = 0;
          } catch {
            // Draw whatever frame is already decoded.
          }
        };
        video.onseeked = () => {
          if (seekTimer) clearTimeout(seekTimer);
          grabDecoded();
        };
        seekTimer = setTimeout(fallback, POSTER_SEEK_TIMEOUT_MS);
        try {
          video.currentTime = seekTo;
        } catch {
          if (seekTimer) clearTimeout(seekTimer);
          grabDecoded();
        }
      };
      video.src = objectUrl;
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(null);
    }
  });
}
