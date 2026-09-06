import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import { seedE2eWallet } from './helpers/collection-page';
import {
  COLLECTIBLES_VAULT_OWNER,
  stubCollectiblesVaultGraph,
} from './helpers/collectibles-vault';

/**
 * Smoke for the public series page shell.
 * Synthetic empty series — no live drop cards required.
 */
const CREATOR = 'e2e.series.testnet';
const SERIES_ID = 'audit-series';
const SERIES_PATH = `/series/${encodeURIComponent(CREATOR)}/${encodeURIComponent(SERIES_ID)}`;
const NIGHT_ROADS_PATH = `/series/${encodeURIComponent('alice.near')}/night-roads`;
const HOLDER_BACK = `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`;

test.describe('series page', () => {
  test('loads brand hero and guest empty with shop exit', async ({ page }) => {
    await gotoApp(page, SERIES_PATH);

    await expect(
      page.getByRole('heading', { level: 1, name: SERIES_ID })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(
      page.locator('.series-hero-title').getByText(SERIES_ID, { exact: true })
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
      page.getByRole('link', { name: `View @${CREATOR}'s profile` })
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
  });

  test('document title includes Series · OnSocial', async ({ page }) => {
    await gotoApp(page, SERIES_PATH);
    await expect(page).toHaveTitle(
      new RegExp(`${SERIES_ID} • Series • OnSocial`),
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
  });
});
