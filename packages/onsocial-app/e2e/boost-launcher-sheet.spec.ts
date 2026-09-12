import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Boost is an owner-face sheet. Launcher / rails must not hop to Portal /boost.
 */
test.describe('boost launcher sheet', () => {
  test('Boost tile is a button that stays in-app', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    await expect(launcher).toBeVisible();

    const boost = launcher.locator('[data-app-id="boost"]');
    await expect(boost).toBeVisible();
    await expect(boost).toHaveAttribute('aria-label', 'Boost');
    await expect(boost).toHaveJSProperty('tagName', 'BUTTON');
    await expect(boost).not.toHaveAttribute('href');

    const extraPages: string[] = [];
    page.context().on('page', (opened) => {
      extraPages.push(opened.url());
    });

    await boost.click();
    await expect(page).toHaveURL(/\/home(?:\?|$)/);
    expect(
      extraPages.filter((url) =>
        /portal\.onsocial|onsocial\.id\/boost/i.test(url)
      )
    ).toEqual([]);
    await expect(page.getByText(/Select wallet/i).first()).toBeVisible({
      timeout: 8_000,
    });
  });
});
