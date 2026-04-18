export const MOBILE_NAV_MIN_WIDTH = 360;
export const MOBILE_NAV_MAX_WIDTH = 768;
export const DESKTOP_NAV_TOP_INSET = 8;
export const DESKTOP_NAV_HEIGHT = 56;
export const DESKTOP_NAV_RADIUS = 22;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

export function getMobileNavMetrics(viewportWidth: number) {
  const mobileViewportScale = clamp(
    (viewportWidth - MOBILE_NAV_MIN_WIDTH) /
      (MOBILE_NAV_MAX_WIDTH - MOBILE_NAV_MIN_WIDTH),
    0,
    1
  );

  const topInset = interpolate(4, 7, mobileViewportScale);
  const height = interpolate(48, 54, mobileViewportScale);
  const radius = interpolate(18, 23, mobileViewportScale);
  const logoSize = interpolate(32, 36, mobileViewportScale);
  const menuRadius = interpolate(24, 28, mobileViewportScale);
  const menuPaddingX = interpolate(18, 20, mobileViewportScale);
  const menuPaddingY = interpolate(18, 20, mobileViewportScale);
  const badgeMaxWidth = interpolate(176, 200, mobileViewportScale);
  const menuGap = interpolate(6, 8, mobileViewportScale);

  return {
    mobileViewportScale,
    topInset,
    height,
    radius,
    logoSize,
    menuRadius,
    menuPaddingX,
    menuPaddingY,
    badgeMaxWidth,
    menuGap,
    menuTop: topInset + height + menuGap,
  };
}

export function getDesktopViewportScale(viewportWidth: number) {
  return clamp((viewportWidth - 768) / (1280 - 768), 0, 1);
}

export function getDesktopNavMetrics() {
  return {
    topInset: DESKTOP_NAV_TOP_INSET,
    height: DESKTOP_NAV_HEIGHT,
    radius: DESKTOP_NAV_RADIUS,
    railTop:
      DESKTOP_NAV_TOP_INSET + DESKTOP_NAV_HEIGHT + DESKTOP_NAV_TOP_INSET,
  };
}

export function interpolateMetric(start: number, end: number, progress: number) {
  return interpolate(start, end, progress);
}