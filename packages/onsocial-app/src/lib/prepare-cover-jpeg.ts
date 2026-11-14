import {
  MEDIA_FRAME_PAN_CENTER,
  mediaFrameCoverSourceRect,
  type MediaFramePan,
} from '@/lib/media-frame-pan';

const JPEG_QUALITY = 0.92;

export type CoverJpegAspect = {
  width: number;
  height: number;
};

/** Avatar / print — sharp enough for hero + cards. */
export const COVER_JPEG_SQUARE: CoverJpegAspect = { width: 512, height: 512 };
/** Banner export — 3:1, covers editor + face hero cover crops. */
export const COVER_JPEG_BANNER: CoverJpegAspect = { width: 1500, height: 500 };
/** About film still — 2:1. */
export const COVER_JPEG_FILM: CoverJpegAspect = { width: 1200, height: 600 };
/** About print — larger square for the bookmark. */
export const COVER_JPEG_PRINT: CoverJpegAspect = { width: 1200, height: 1200 };

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

async function resolveImageBlob(source: File | Blob | string): Promise<Blob> {
  if (typeof source !== 'string') return source;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error('Could not read that image.');
  }
  return response.blob();
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not prepare image.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

/**
 * Bake a cover crop to JPEG using the same geometry as CSS
 * `object-fit: cover` + `object-position`.
 */
export async function prepareCoverJpeg(
  source: File | Blob | string,
  aspect: CoverJpegAspect,
  pan: MediaFramePan = MEDIA_FRAME_PAN_CENTER,
  fileName = 'cover.jpg'
): Promise<File> {
  const blob = await resolveImageBlob(source);
  if (blob.type.startsWith('video/')) {
    throw new Error('Choose an image file.');
  }
  const img = await loadImageFromBlob(blob);
  const imageW = img.naturalWidth || img.width;
  const imageH = img.naturalHeight || img.height;
  if (imageW < 1 || imageH < 1) {
    throw new Error('Could not read that image.');
  }

  const { sx, sy, sw, sh } = mediaFrameCoverSourceRect(
    imageW,
    imageH,
    aspect.width,
    aspect.height,
    pan
  );

  const canvas = document.createElement('canvas');
  canvas.width = aspect.width;
  canvas.height = aspect.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare image.');
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, aspect.width, aspect.height);

  const out = await canvasToJpegBlob(canvas);
  const base =
    (typeof source !== 'string' && 'name' in source
      ? source.name.replace(/\.[^.]+$/, '')
      : null) || fileName.replace(/\.[^.]+$/, '') || 'cover';
  return new File([out], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
