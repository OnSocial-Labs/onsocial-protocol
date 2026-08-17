import { test } from '@playwright/test';
import { expectSearchVisible, gotoApp } from './helpers';

/**
 * Smoke for Collectibles shell — search chrome.
 * Kind rail can depend on holdings hydrate; keep this search-only.
 */
test.describe('collectibles shell', () => {
  test('loads search chrome', async ({ page }) => {
    await gotoApp(page, '/collectibles');
    await expectSearchVisible(page, 'Search collectibles');
  });
});
