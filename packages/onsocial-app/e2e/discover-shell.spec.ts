import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, expectTabVisible, gotoApp } from './helpers';

/**
 * Smoke for Discover shell — omni search + primary tabs.
 * Does not assert live profile/topic rows.
 */
test.describe('discover shell', () => {
  test('loads search and Discover tabs', async ({ page }) => {
    await gotoApp(page, '/discover');

    await expect(
      page.getByRole('textbox', { name: 'Search people, topics, and tickers' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    await expectTabVisible(page, 'Discover', 'Trending');
    await expectTabVisible(page, 'Discover', 'Profiles');
  });
});
