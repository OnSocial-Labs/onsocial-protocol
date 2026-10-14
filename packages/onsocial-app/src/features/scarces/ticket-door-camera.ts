import jsQR from 'jsqr';

/** Long edge sent to the QR reader. Full sensor frames are slower than they need to be. */
const DECODE_MAX_EDGE = 720;

/**
 * Rear camera first, then any camera. A denied permission is not retried —
 * the next attempt would prompt again.
 */
export async function openDoorCamera(): Promise<MediaStream> {
  const attempts: Array<boolean | MediaTrackConstraints> = [
    {
      facingMode: { exact: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    true,
  ];
  let lastError: unknown;
  for (const video of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video });
    } catch (error) {
      lastError = error;
      if (
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' ||
          error.name === 'SecurityError' ||
          error.name === 'PermissionDeniedError')
      ) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Camera unavailable');
}

/** Read one QR from RGBA pixels. Null when the frame has no code. */
export function qrTextFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  if (width < 1 || height < 1 || data.length < width * height * 4) return null;
  const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  const text = code?.data?.trim();
  return text || null;
}

/** Draw the current video frame and read a QR. Used when the browser has no detector. */
export function qrTextFromVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): string | null {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) return null;
  const scale = Math.min(1, DECODE_MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return qrTextFromRgba(image.data, width, height);
}
