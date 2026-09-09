import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Leave is typed parent (`router.push`), never history-back.
 * Messages inbox and Leaderboard both go up to Home.
 */
test.describe('leave correctness', () => {
  test('Messages inbox dock Back leaves to Home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/messages');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/home\/?$/);
  });

  test('Leaderboard dock Back leaves to Home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/leaderboard');
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/home\/?$/);
  });
});
