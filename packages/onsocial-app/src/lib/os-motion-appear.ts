const MOTION_APPEAR_FALLBACK_MS = 280;

/** `--os-motion-appear` (280ms fallback). Route settle and the drop rise share this. */
export function readMotionAppearMs(): number {
  if (typeof window === 'undefined') return MOTION_APPEAR_FALLBACK_MS;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--os-motion-appear')
    .trim();
  if (raw.endsWith('ms')) {
    const ms = Number.parseFloat(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  if (raw.endsWith('s')) {
    const seconds = Number.parseFloat(raw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return MOTION_APPEAR_FALLBACK_MS;
}
