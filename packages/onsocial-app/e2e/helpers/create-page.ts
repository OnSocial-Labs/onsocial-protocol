import { expect, type Locator } from '@playwright/test';

/**
 * Page roots share `.os-app-chrome-page`. Horizontal padding is `--os-gutter`
 * (0.75rem), read from the computed root font size.
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
        const expected = `${rootFont * 0.75}px`;
        const ok =
          gutter === '0.75rem' &&
          style.paddingLeft === expected &&
          style.paddingRight === expected;
        return ok
          ? 'ok'
          : `gutter=${gutter} pad=${style.paddingLeft}/${style.paddingRight} expected=${expected}`;
      })
    )
    .toBe('ok');
}
