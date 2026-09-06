import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { stubMarketCreatorShop } from './helpers/market-creator';

const CREATOR = 'e2e.market.testnet';
const SHOP_PATH = `/market?creator=${encodeURIComponent(CREATOR)}`;

test.describe('market creator shop', () => {
  test('empty creator shop is a door, not a listings-only miss', async ({
    page,
  }) => {
    await stubMarketCreatorShop(page, { drops: 'empty' });
    await gotoApp(page, SHOP_PATH);

    await expect(page.locator('[data-market-creator-shop]')).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(
      page.getByRole('link', { name: `View @${CREATOR}'s profile` })
    ).toBeVisible();
    await expect(page.getByText('From @', { exact: false })).toHaveCount(0);
    await expect(page.getByText('No live listings from')).toHaveCount(0);
    await expect(
      page.getByText(`No drops or listings from @${CREATOR} yet.`)
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Clear creator filter' })
    ).toBeVisible();
  });

  test('SSR miss keeps the skeleton until drops settle', async ({ page }) => {
    await stubMarketCreatorShop(page, {
      drops: 'night-drive',
      catalogDelayMs: 2500,
    });
    await gotoApp(page, SHOP_PATH);
    await expect(page.locator('[data-market-creator-shop]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator('.market-listing-row--skeleton').first()).toBeVisible(
      { timeout: 8_000 }
    );
    await expect(page.getByText('No live listings from')).toHaveCount(0);
    await expect(page.getByText('No drops or listings from')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Collect Night Drive' })).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.locator('.market-listing-row--skeleton')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Quiet Print' })).toBeVisible();
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
  });
});
