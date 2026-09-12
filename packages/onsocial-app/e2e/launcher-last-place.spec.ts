import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Home stays the daily root (no dock Back). The launcher is apps — not a
 * recents slot for the last profile.
 */
test.describe('launcher last place', () => {
  test('Home has no dock Back and no Return chip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'onsocial.os.last-place',
        JSON.stringify({
          href: '/@alice.testnet',
          accountId: 'alice.testnet',
          label: 'Alice',
        })
      );
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    await expect(
      page.locator('.portfolio-summon-dock [aria-label="Back"]')
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    await expect(launcher).toBeVisible();

    await expect(launcher.locator('[data-app-id="last-place"]')).toHaveCount(0);
    await expect(launcher.getByText('Return', { exact: true })).toHaveCount(0);
    await expect(
      launcher.locator('ul').first().locator('[data-app-id="home"]')
    ).toBeVisible();
  });
});
