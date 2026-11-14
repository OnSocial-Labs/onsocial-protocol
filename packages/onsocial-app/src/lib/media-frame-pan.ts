/** In-frame cover pan — same model as CSS `object-fit: cover` + `object-position`. */

export type MediaFramePan = {
  /** 0–100, CSS object-position x */
  x: number;
  /** 0–100, CSS object-position y */
  y: number;
};

export const MEDIA_FRAME_PAN_CENTER: MediaFramePan = { x: 50, y: 50 };

export function clampMediaFramePan(pan: MediaFramePan): MediaFramePan {
  return {
    x: clampPercent(pan.x),
    y: clampPercent(pan.y),
  };
}

export function isMediaFramePanCentered(
  pan: MediaFramePan | null | undefined
): boolean {
  if (!pan) return true;
  return nearly(pan.x, 50) && nearly(pan.y, 50);
}

export function mediaFramePanStyle(
  pan: MediaFramePan | null | undefined
): { objectPosition: string } {
  const next = pan ? clampMediaFramePan(pan) : MEDIA_FRAME_PAN_CENTER;
  return { objectPosition: `${next.x}% ${next.y}%` };
}

/**
 * Finger/mouse delta → next pan. Moving the image right reveals more of the
 * left edge (object-position x decreases), matching cover positioning.
 */
export function panMediaFrameByDelta(
  pan: MediaFramePan,
  dxPx: number,
  dyPx: number,
  frameW: number,
  frameH: number,
  imageW: number,
  imageH: number
): MediaFramePan {
  if (frameW < 1 || frameH < 1 || imageW < 1 || imageH < 1) {
    return clampMediaFramePan(pan);
  }
  const scale = Math.max(frameW / imageW, frameH / imageH);
  const extraX = Math.max(0, imageW * scale - frameW);
  const extraY = Math.max(0, imageH * scale - frameH);
  const nextX =
    extraX < 1 ? 50 : pan.x - (dxPx / extraX) * 100;
  const nextY =
    extraY < 1 ? 50 : pan.y - (dyPx / extraY) * 100;
  return clampMediaFramePan({ x: nextX, y: nextY });
}

/** Source rect inside the image that fills `frameW`×`frameH` at `pan`. */
export function mediaFrameCoverSourceRect(
  imageW: number,
  imageH: number,
  frameW: number,
  frameH: number,
  pan: MediaFramePan = MEDIA_FRAME_PAN_CENTER
): { sx: number; sy: number; sw: number; sh: number } {
  const safePan = clampMediaFramePan(pan);
  if (imageW < 1 || imageH < 1 || frameW < 1 || frameH < 1) {
    return { sx: 0, sy: 0, sw: Math.max(1, imageW), sh: Math.max(1, imageH) };
  }
  const scale = Math.max(frameW / imageW, frameH / imageH);
  const sw = frameW / scale;
  const sh = frameH / scale;
  const extraX = Math.max(0, imageW - sw);
  const extraY = Math.max(0, imageH - sh);
  const sx = extraX * (safePan.x / 100);
  const sy = extraY * (safePan.y / 100);
  return {
    sx: clamp(sx, 0, Math.max(0, imageW - sw)),
    sy: clamp(sy, 0, Math.max(0, imageH - sh)),
    sw: Math.min(sw, imageW),
    sh: Math.min(sh, imageH),
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nearly(value: number, target: number): boolean {
  return Math.abs(value - target) < 0.5;
}
