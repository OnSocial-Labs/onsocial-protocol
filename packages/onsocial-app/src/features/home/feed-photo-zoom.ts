/**
 * Shared-element zoom for the feed photo enlarge face — pure rect math plus
 * the tile-origin capture. The enlarge screen flies a cover-cropped clone of
 * the tapped thumbnail to the contain-fitted stage box (and back on close),
 * so the photo appears to grow out of the card instead of popping in.
 */

export interface FeedPhotoZoomRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FeedPhotoZoomOrigin {
  /** Tapped thumbnail image — hidden while the face is up, restored after. */
  element: HTMLImageElement;
  /** Viewport rect at capture time; re-measured fresh at each flight. */
  rect: FeedPhotoZoomRect;
  /** The tile's resolved URL (currentSrc) — cached, so the clone paints instantly. */
  src: string;
  /** naturalWidth / naturalHeight — contain-fit target needs it pre-load. */
  aspect: number;
  /** Computed border-radius of the thumbnail at tap time. */
  radius: string;
  /** Index into the enlarge face `photos` array. */
  mediaIndex: number;
}

export function rectFromRectLike(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): FeedPhotoZoomRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Contain-fit a box of `aspect` (w/h) inside `box`, centered — matches the
 * `.feed-photo-image` box (auto size + max 100% inside the flex-centered
 * stage) so the clone lands exactly where the real image paints.
 */
export function containFitRect(
  box: FeedPhotoZoomRect,
  aspect: number
): FeedPhotoZoomRect {
  if (
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return { ...box, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  }
  let width = box.width;
  let height = width / aspect;
  if (height > box.height) {
    height = box.height;
    width = height * aspect;
  }
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * Capture the tapped tile's thumbnail as a zoom origin. Still images only —
 * a video tile has no cacheable raster the clone can paint, so video taps
 * keep the plain face pop. Returns null when the thumbnail cannot fly.
 */
export function zoomOriginFromTile(
  tile: HTMLElement | null,
  mediaIndex: number
): FeedPhotoZoomOrigin | null {
  if (!tile || mediaIndex < 0) return null;
  const media = tile.querySelector('.post-media-element');
  if (!media || media.tagName !== 'IMG') return null;
  const img = media as HTMLImageElement;
  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return null;
  }
  const rect = img.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const src = img.currentSrc || img.src;
  if (!src) return null;
  const radius =
    typeof getComputedStyle === 'function'
      ? getComputedStyle(img).borderRadius
      : '';
  return {
    element: img,
    rect: rectFromRectLike(rect),
    src,
    aspect: img.naturalWidth / img.naturalHeight,
    radius: radius && radius !== '0px' ? radius : '0px',
    mediaIndex,
  };
}

/** Rects that round to the same layout box — flight skip / test helper. */
export function zoomRectsEqual(
  a: FeedPhotoZoomRect,
  b: FeedPhotoZoomRect
): boolean {
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}
