import { expect, type Locator } from '@playwright/test';

/** Page roots share `.os-app-chrome-page` → `--os-screen-body-pad-x` (1rem). */
export async function expectChromePageInset(root: Locator): Promise<void> {
  await expect(root).toBeVisible();
  await expect(root).toHaveClass(/os-app-chrome-page/);
  await expect
    .poll(async () =>
      root.evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.paddingLeft} ${style.paddingRight}`;
      })
    )
    .toBe('16px 16px');
}
