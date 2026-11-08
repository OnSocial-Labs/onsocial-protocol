import { expect, type Locator } from '@playwright/test';

/** Page roots share `.os-app-chrome-page` and `--os-gutter` (0.75rem). */
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
        const gutterOk = gutter === '0.75rem' || gutter === '.75rem';
        const ok =
          gutterOk &&
          style.paddingLeft === expected &&
          style.paddingRight === expected;
        return ok
          ? 'ok'
          : `gutter=${gutter} pad=${style.paddingLeft}/${style.paddingRight} expected=${expected}`;
      })
    )
    .toBe('ok');
}
