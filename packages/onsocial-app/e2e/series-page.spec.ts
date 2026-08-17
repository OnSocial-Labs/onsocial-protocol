import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';

/**
 * Smoke for the public series page shell.
 * Synthetic empty series — no live drop cards required.
 */
const CREATOR = 'e2e.series.testnet';
const SERIES_ID = 'audit-series';
const SERIES_PATH = `/series/${encodeURIComponent(CREATOR)}/${encodeURIComponent(SERIES_ID)}`;

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

  test('document title includes Series · OnSocial', async ({ page }) => {
    await gotoApp(page, SERIES_PATH);
    await expect(page).toHaveTitle(
      new RegExp(`${SERIES_ID} • Series • OnSocial`),
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
  });
});
