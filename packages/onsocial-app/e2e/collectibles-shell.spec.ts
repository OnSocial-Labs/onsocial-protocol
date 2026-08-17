import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';

/**
 * Smoke for Collectibles shell — search chrome.
 * Kind rail can depend on holdings hydrate; keep this search-only.
 */
test.describe('collectibles shell', () => {
  test('loads search chrome', async ({ page }) => {
    await gotoApp(page, '/collectibles');

    await expect(
      page.getByRole('textbox', { name: 'Search collectibles' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  });
});
