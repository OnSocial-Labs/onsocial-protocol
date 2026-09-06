import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import {
  COLLECTIBLES_VAULT_OWNER,
  stubCollectiblesVaultGraph,
} from './helpers/collectibles-vault';
import { stubSeriesCreatorCatalog } from './helpers/series-page';

/**
 * Smoke for the public series page shell.
 * Synthetic empty series — no live drop cards required.
 */
const CREATOR = 'e2e.series.testnet';
const SERIES_ID = 'audit-series';
const SERIES_TITLE = 'Audit Series';
const SERIES_PATH = `/series/${encodeURIComponent(CREATOR)}/${encodeURIComponent(SERIES_ID)}`;
const NIGHT_ROADS_PATH = `/series/${encodeURIComponent('alice.near')}/night-roads`;
const HOLDER_BACK = `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`;

test.describe('series page', () => {
  test('loads brand hero and guest empty with shop exit', async ({ page }) => {
    await stubSeriesCreatorCatalog(page, { rows: 'empty' });
    await gotoApp(page, SERIES_PATH);

    await expect(
      page.getByRole('heading', { level: 1, name: SERIES_TITLE })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      page.locator('.series-hero-title').getByText(SERIES_TITLE, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('0 drops', { exact: true }).first()
    ).toBeVisible();

    const root = page.locator('.series-page');
    await expect(root).not.toHaveClass(/is-use-first/);
    await expect(root).toHaveAttribute(
      'data-series-back',
      `/market?creator=${encodeURIComponent(CREATOR)}`
    );
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toHaveCount(0);

    await expect(
      page.getByRole('link', { name: "View E2e's profile" })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Shop this creator' })
    ).toHaveAttribute('href', `/market?creator=${encodeURIComponent(CREATOR)}`);

    await expect(
      page.getByText('No drops in this series yet.', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit series' })).toHaveCount(
      0
    );
  });

  test('SSR catalog miss keeps the skeleton until the client fetch settles', async ({
    page,
  }) => {
    await stubSeriesCreatorCatalog(page, {
      rows: 'night-roads',
      catalogDelayMs: 2500,
    });
    await gotoApp(page, NIGHT_ROADS_PATH);
    await expect(page.locator('[data-series-page-skeleton]').first()).toBeVisible(
      {
        timeout: 8_000,
      }
    );
    await expect(page.getByText('No drops in this series yet.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Collect Night Drive' })).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.locator('[data-series-page-skeleton]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Quiet Print' })).toBeVisible();
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
  });

  test('held series puts Play rows and Collectibles back above shop', async ({
    page,
  }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await stubCollectiblesVaultGraph(page);
    await gotoApp(page, NIGHT_ROADS_PATH);

    const root = page.locator('.series-page');
    await expect(root).toHaveClass(/is-use-first/, {
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(root).toHaveAttribute('data-series-use-first', '');
    await expect(root).toHaveAttribute('data-series-back', HOLDER_BACK);
    await expect(page.locator('.series-hero-title')).toHaveText('Night Roads');
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toHaveAttribute('href', HOLDER_BACK);
    await expect(
      page.getByRole('link', { name: 'Shop this creator' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Play Night Drive' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Play Dusk Run' })
    ).toBeVisible();
    await expect(page.getByText('No drops in this series yet.')).toHaveCount(0);
    await expect(page.getByText('Chapter One')).toHaveCount(0);
    await expect(page.locator('.app-drop-card')).toHaveCount(0);
  });

  test('Collectibles series heading opens this page', async ({ page }) => {
    await seedE2eWallet(page, COLLECTIBLES_VAULT_OWNER);
    await stubSeriesCreatorCatalog(page, { rows: 'night-roads' });
    await stubCollectiblesVaultGraph(page);
    await gotoApp(page, `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`);
    const seriesLink = page.getByRole('link', { name: /Night Roads/ });
    await expect(seriesLink).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(seriesLink).toHaveAttribute(
      'href',
      `/series/${encodeURIComponent('alice.near')}/night-roads`
    );
    await seriesLink.click();
    await expect(page).toHaveURL(/\/series\/alice\.near\/night-roads/);
    await expect(page.locator('.series-hero-title')).toHaveText('Night Roads');
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toBeVisible();
  });

  test('document title includes Series · OnSocial', async ({ page }) => {
    await stubSeriesCreatorCatalog(page, { rows: 'empty' });
    await gotoApp(page, SERIES_PATH);
    await expect(page).toHaveTitle(
      new RegExp(`${SERIES_TITLE} • Series • OnSocial`),
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
  });
});
