import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Leave is typed parent (`router.push`), never history-back.
 * Seed a decoy entry first — `history.back()` would land there, not Home.
 */
test.describe('leave correctness', () => {
  test('Messages inbox dock Back leaves to Home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/discover');
    await dismissNextDevOverlay(page);
    await gotoApp(page, '/messages');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/home\/?$/);
  });

  test('Leaderboard close leaves to Home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/messages');
    await dismissNextDevOverlay(page);
    await gotoApp(page, '/leaderboard');
    await dismissNextDevOverlay(page);
    // Appear-page sheet tucks the dock — × is leave, not history-back.
    await page.getByRole('button', { name: 'Close leaderboard' }).click();
    await expect(page).toHaveURL(/\/home\/?$/);
  });
});
