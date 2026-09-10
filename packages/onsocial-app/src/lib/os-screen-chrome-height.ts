/**
 * Glass chrome inset sync — measure resting header height into
 * `--os-screen-chrome-height`, and freeze that value while scroll-tuck is
 * visual-only so body padding / catch-up chips do not jump.
 *
 * Guild immersive rails already tuck with transform + stable scroll-padding;
 * compact glass Home / Discover / Market / DAO used to remasure on collapse.
 *
 * Prefer `data-os-chrome-tucked` (set by screen / toolbar rails). Class
 * sniffing remains a fallback for older markup.
 */

import { writeDropsDebugLog } from '@/lib/drops-debug-log';

export const OS_CHROME_TUCKED_ATTR = 'data-os-chrome-tucked';

export function isOsAppChromeVisuallyTucked(header: HTMLElement): boolean {
  if (header.hasAttribute(OS_CHROME_TUCKED_ATTR)) return true;
  if (header.querySelector(`[${OS_CHROME_TUCKED_ATTR}]`)) return true;
  // Fallback — CSS still uses these classes for the visual tuck motion.
  if (header.classList.contains('is-search-tucked')) return true;
  if (header.querySelector('.os-app-chrome-rail.is-scroll-hidden')) return true;
  if (header.querySelector('.standing-toolbar-rail.is-scroll-hidden')) {
    return true;
  }
  return false;
}

/**
 * Writes `--os-screen-chrome-height` from the fully revealed header.
 * While tucked, reasserts the last resting height instead of the collapsed box.
 */
export function syncOsScreenChromeHeight(
  screen: HTMLElement | null,
  header: HTMLElement,
  restingHeightRef: { current: number }
): void {
  if (!screen) return;
  const dropsScreen = Boolean(
    header.querySelector('[data-drops-loading], [data-drops-ready]')
  );

  if (isOsAppChromeVisuallyTucked(header)) {
    if (restingHeightRef.current > 0) {
      screen.style.setProperty(
        '--os-screen-chrome-height',
        `${restingHeightRef.current}px`
      );
      if (dropsScreen) {
        // #region agent log
        writeDropsDebugLog('B', 'chrome height reasserted while tucked', {
          phase: 'sync',
          tucked: true,
          measuredHeight: header.offsetHeight,
          restingHeight: restingHeightRef.current,
          chromeVar: screen.style.getPropertyValue('--os-screen-chrome-height'),
        });
        // #endregion
      }
    }
    return;
  }

  const height = header.offsetHeight;
  if (height <= 0) return;
  const previousRestingHeight = restingHeightRef.current;
  restingHeightRef.current = height;
  screen.style.setProperty('--os-screen-chrome-height', `${height}px`);
  if (dropsScreen) {
    // #region agent log
    writeDropsDebugLog('B', 'chrome height measured', {
      phase: 'sync',
      tucked: false,
      measuredHeight: height,
      previousRestingHeight,
      chromeVar: screen.style.getPropertyValue('--os-screen-chrome-height'),
    });
    // #endregion
  }
}
