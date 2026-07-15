/** Square export size for guild avatars (sharp enough for hero + cards). */
const GUILD_AVATAR_SIZE = 512;
/** Bleed past the square so soft PNG edges can't leave corner gutters. */
const COVER_OVERSCALE = 1.06;
const ALPHA_TRIM_THRESHOLD = 12;

function resolvePadColor(): string {
  if (typeof document === 'undefined') return '#0a0a0a';
  const styles = getComputedStyle(document.documentElement);
  const bg = styles.getPropertyValue('--bg').trim();
  if (bg) return bg;
  const rgb = styles.getPropertyValue('--bg-rgb').trim();
  if (rgb) return `rgb(${rgb})`;
  return '#0a0a0a';
}

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

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not prepare guild avatar.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.92
    );
  });
}

function trimOpaqueBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { sx: number; sy: number; sw: number; sh: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= ALPHA_TRIM_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return null;
  return {
    sx: left,
    sy: top,
    sw: right - left + 1,
    sh: bottom - top + 1,
  };
}

function averageOpaqueColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): string | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= ALPHA_TRIM_THRESHOLD) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (n === 0) return null;
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

/**
 * Bake guild avatar to a fully opaque square JPEG.
 * Trims transparent padding, covers the square with a slight overscale,
 * and pads remaining alpha with a blended fill so rounded frames never
 * show empty corner gutters.
 */
export async function prepareGuildAvatarFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  const img = await loadImage(file);
  const source = document.createElement('canvas');
  source.width = img.naturalWidth || img.width;
  source.height = img.naturalHeight || img.height;
  if (source.width < 1 || source.height < 1) {
    throw new Error('Could not read that image.');
  }
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) {
    throw new Error('Could not prepare guild avatar.');
  }
  sourceCtx.drawImage(img, 0, 0);

  const crop =
    trimOpaqueBounds(sourceCtx, source.width, source.height) ?? {
      sx: 0,
      sy: 0,
      sw: source.width,
      sh: source.height,
    };
  const pad =
    averageOpaqueColor(sourceCtx, source.width, source.height) ??
    resolvePadColor();

  const size = GUILD_AVATAR_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare guild avatar.');
  }

  ctx.fillStyle = pad;
  ctx.fillRect(0, 0, size, size);

  const scale =
    Math.max(size / crop.sw, size / crop.sh) * COVER_OVERSCALE;
  const drawW = crop.sw * scale;
  const drawH = crop.sh * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;
  ctx.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    dx,
    dy,
    drawW,
    drawH
  );

  // Flatten any remaining alpha against the pad (GIF/WebP edge fringe).
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = pad;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const blob = await canvasToJpegBlob(canvas);
  const base = file.name.replace(/\.[^.]+$/, '') || 'guild-avatar';
  return new File([blob], `${base}-avatar.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
