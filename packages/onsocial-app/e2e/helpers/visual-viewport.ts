import type { Page } from '@playwright/test';

/**
 * Shorten `visualViewport` by `lift` pixels at the bottom.
 * 56 matches a phone toolbar. A real keyboard is a few hundred.
 * The layout viewport stays the Playwright size.
 */
export async function stubShorterVisualViewport(
  page: Page,
  lift = 56
): Promise<void> {
  const gap = Math.max(0, Math.round(lift));
  await page.addInitScript(`(() => {
    var lift = ${gap};
    var real = window.visualViewport;
    var vv = {
      get height() { return Math.max(320, (window.innerHeight || 0) - lift); },
      get width() { return window.innerWidth || 0; },
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
      addEventListener: function (type, fn) {
        if (real && real.addEventListener) real.addEventListener(type, fn);
      },
      removeEventListener: function (type, fn) {
        if (real && real.removeEventListener) real.removeEventListener(type, fn);
      }
    };
    try {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        get: function () { return vv; }
      });
    } catch (error) {}
  })();`);
}
