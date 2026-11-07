import { expect, type Locator } from '@playwright/test';

/**
 * Page roots share `.os-app-chrome-page`. Horizontal padding is the root
 * gutter (`--os-gutter: 0.75rem`), read from the computed root font size.
 */
export async function expectChromePageInset(root: Locator): Promise<void> {
  await expect(root).toBeVisible();
  await expect(root).toHaveClass(/os-app-chrome-page/);
  await expect
    .poll(async () =>
      root.evaluate((el) => {
        const rootFont = parseFloat(
          getComputedStyle(document.documentElement).fontSize
        );
        const gutter = getComputedStyle(el)
          .getPropertyValue('--os-gutter')
          .trim();
        const style = getComputedStyle(el);
        const expectedPx = rootFont * 0.75;
        const left = parseFloat(style.paddingLeft);
        const right = parseFloat(style.paddingRight);
        const gutterRem = gutter.endsWith('rem') ? parseFloat(gutter) : NaN;
        const ok =
          Math.abs(gutterRem - 0.75) < 0.001 &&
          Math.abs(left - expectedPx) < 0.05 &&
          Math.abs(right - expectedPx) < 0.05;
        return ok
          ? 'ok'
          : `gutter=${gutter} pad=${style.paddingLeft}/${style.paddingRight} expected=${expectedPx}px`;
      })
    )
    .toBe('ok');
}
