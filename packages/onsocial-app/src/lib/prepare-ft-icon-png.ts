import { FT_ICON_PX, getFtIconError } from '@/lib/app-create-token';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
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

function drawCoverPng(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare icon.');
  }
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (sw < 1 || sh < 1) {
    throw new Error('Could not read that image.');
  }
  const scale = Math.max(size / sw, size / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas.toDataURL('image/png');
}

/** Bake a photo to a 64px PNG data URL that fits on-chain FT metadata. */
export async function prepareFtIconPngDataUrl(file: File): Promise<string> {
  if (!isPostImageMime(file.type)) {
    throw new Error('Use a PNG or JPEG.');
  }
  if (file.size > POST_IMAGE_MAX_BYTES) {
    throw new Error('Use a smaller image.');
  }

  const img = await loadImage(file);
  for (const size of [FT_ICON_PX, 48]) {
    const dataUrl = drawCoverPng(img, size);
    if (!getFtIconError(dataUrl)) return dataUrl;
  }
  throw new Error('Use a smaller image.');
}
