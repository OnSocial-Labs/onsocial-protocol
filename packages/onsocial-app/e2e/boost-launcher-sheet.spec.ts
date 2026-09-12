import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Boost is an owner-face sheet. The launcher is apps — not a second door.
 */
test.describe('boost launcher', () => {
  test('Boost is not a first-party launcher tile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    await expect(launcher).toBeVisible();

    await expect(launcher.locator('[data-app-id="boost"]')).toHaveCount(0);
    await expect(launcher.getByRole('link', { name: 'Boost' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/home(?:\?|$)/);
  });
});
