import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

const LAST_PLACE = {
  href: '/@alice.testnet',
  accountId: 'alice.testnet',
  label: '@alice.testnet',
} as const;

/**
 * Home stays the daily root (no dock Back). Return to the last page is a
 * launcher hop — the leading tile, not `router.back()`.
 */
test.describe('launcher last place', () => {
  test('Home has no dock Back and the launcher leads with the last page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((place) => {
      sessionStorage.setItem('onsocial.os.last-place', JSON.stringify(place));
    }, LAST_PLACE);

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    await expect(
      page.locator('.portfolio-summon-dock [aria-label="Back"]')
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Open launcher' }).click();
    const launcher = page.getByRole('dialog', { name: 'OnSocial launcher' });
    await expect(launcher).toBeVisible();

    const lastPlace = launcher.locator('[data-app-id="last-place"]');
    await expect(lastPlace).toBeVisible();
    await expect(lastPlace).toHaveAttribute('aria-label', LAST_PLACE.label);

    const firstTile = launcher.locator('ul').first().locator('li').first();
    await expect(firstTile.locator('[data-app-id="last-place"]')).toBeVisible();

    await lastPlace.click();
    await expect(page).toHaveURL(/\/@alice\.testnet\/?$/);
  });
});
