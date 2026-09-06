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

    await expect(page.locator('[data-market-creator-shop]').first()).toBeVisible(
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
    await expect(
      page.getByRole('link', { name: "View E2e's profile" })
    ).toBeVisible();
    await expect(page.locator('.standing-row-name')).toHaveText('E2e');
    await expect(page.locator('.standing-row-handle')).toHaveText(
      '@e2e.market.testnet'
    );
    await expect(page.getByText('From @', { exact: false })).toHaveCount(0);
    await expect(page.getByText('No live listings from')).toHaveCount(0);
    await expect(page.getByText('No drops or listings from')).toHaveCount(0);
    await expect(page.getByText('Nothing in this shop yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse Market' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse Market' })).toHaveClass(
      /os-sheet-action/
    );
    await expect(
      page.getByRole('button', { name: 'Clear creator filter' })
    ).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Listing type' })).toHaveCount(
      0
    );
    await expect(page.getByPlaceholder('Search shop')).toBeVisible();
    await expect(page).toHaveTitle(/E2e • Market/i);
    await expect(page.getByRole('button', { name: /Open filter menu/ })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: /Open sort menu/ })).toHaveCount(
      0
    );
  });

  test('SSR miss keeps the shop skeleton until drops settle', async ({
    page,
  }) => {
    await stubMarketCreatorShop(page, {
      drops: 'night-drive',
      catalogDelayMs: 2500,
    });
    await gotoApp(page, SHOP_PATH);
    await expect(page.locator('[data-market-creator-shop]').first()).toBeVisible(
      { timeout: 8_000 }
    );
    await expect(
      page.locator('[data-market-creator-skeleton]').first()
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.market-listing-row--skeleton').first()).toBeVisible();
    await expect(page.getByText('No live listings from')).toHaveCount(0);
    await expect(page.getByText('No drops or listings from')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Mint Night Drive' })
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('[data-market-creator-skeleton]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Quiet Print' })).toBeVisible();
    await expect(page.locator('[data-market-creator-group="live"]')).toBeVisible();
    await expect(page.locator('[data-market-creator-group="past"]')).toBeVisible();
    await expect(page.getByText('Album · 2 NEAR')).toBeVisible();
    await expect(page.getByText('Art · 2 NEAR')).toBeVisible();
    await expect(page.getByText('Live ·')).toHaveCount(0);
    await expect(page.getByText('2 drops')).toBeVisible();
    await expect(page.getByRole('button', { name: /Open filter menu/ })).toBeVisible();
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Listing type' })).toHaveCount(
      0
    );
  });

  test('shop search includes drops', async ({ page }) => {
    await stubMarketCreatorShop(page, { drops: 'night-drive' });
    await gotoApp(page, SHOP_PATH);
    await expect(
      page.getByRole('button', { name: 'Mint Night Drive' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await page.getByPlaceholder('Search shop').fill('night');
    await expect(page.getByRole('button', { name: 'Mint Night Drive' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Quiet Print' })).toHaveCount(
      0
    );
  });
});
