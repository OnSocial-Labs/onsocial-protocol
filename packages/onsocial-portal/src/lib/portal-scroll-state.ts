/** Shared scroll position — Lenis-safe (window.scrollY can lag after client nav). */
let latestScrollY = 0;
let hasLenisScroll = false;

export function setPortalScrollY(scrollY: number) {
  if (!Number.isFinite(scrollY)) {
    return;
  }

  hasLenisScroll = true;
  latestScrollY = Math.max(0, scrollY);
}

export function resetPortalScrollY(scrollY = 0) {
  hasLenisScroll = false;
  latestScrollY = Math.max(0, scrollY);
}

export function getPortalScrollY(): number {
  if (hasLenisScroll) {
    return latestScrollY;
  }

  if (typeof window === 'undefined') {
    return latestScrollY;
  }

  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    0
  );
}

export function syncPortalScrollYFromWindow() {
  if (typeof window === 'undefined') {
    return;
  }

  const y = Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
    0
  );
  resetPortalScrollY(y);
}
