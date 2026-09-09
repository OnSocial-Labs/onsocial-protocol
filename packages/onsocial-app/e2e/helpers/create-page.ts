import { expect, type Locator } from '@playwright/test';

/** Create forms share `.os-app-chrome-page` → `--os-screen-body-pad-x` (1rem). */
export async function expectCreatePageInset(form: Locator): Promise<void> {
  await expect(form).toBeVisible();
  await expect(form).toHaveClass(/os-app-chrome-page/);
  await expect
    .poll(async () =>
      form.evaluate((el) => {
        const style = getComputedStyle(el);
        return `${style.paddingLeft} ${style.paddingRight}`;
      })
    )
    .toBe('16px 16px');
}
