import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { expectMarketChrome } from './helpers/market';
import { stubMarketLiveFirstBrowse } from './helpers/market-live-first';

test.describe('market live-first browse', () => {
  test('All paints live Buy before ended Settle', async ({ page }) => {
    await stubMarketLiveFirstBrowse(page);
    await gotoApp(page, '/market');
    await expectMarketChrome(page);

    const search = page.getByRole('textbox', {
      name: 'Search Market listings',
    });
    await search.fill('e2e-live-first');

    const results = page.locator('#market-listing-results');
    await expect(results.locator('[data-market-listing-group="live"]')).toBeVisible(
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
    await expect(
      results.locator('[data-market-listing-group="ended"]')
    ).toBeVisible();
    await expect(results.locator('[data-market-ended-label]')).toHaveText('Ended');

    const liveRow = results.locator(
      '[data-market-listing-group="live"] .market-listing-row'
    );
    const endedRow = results.locator(
      '[data-market-listing-group="ended"] .market-listing-row'
    );
    await expect(liveRow).toHaveCount(1);
    await expect(endedRow).toHaveCount(1);
    await expect(liveRow.getByRole('button', { name: /^Buy / })).toBeVisible();
    await expect(endedRow.getByRole('button', { name: /^Settle / })).toBeVisible();
    await expect(liveRow.getByText('e2e-live-first Live Ask')).toBeVisible();
    await expect(endedRow.getByText('e2e-live-first Ended Lot')).toBeVisible();

    const liveBox = await liveRow.boundingBox();
    const endedBox = await endedRow.boundingBox();
    expect(liveBox).toBeTruthy();
    expect(endedBox).toBeTruthy();
    expect(liveBox!.y).toBeLessThan(endedBox!.y);

    await expect(page.getByRole('tablist', { name: 'Listing type' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fixed' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Auctions' })).toBeVisible();
  });
});
