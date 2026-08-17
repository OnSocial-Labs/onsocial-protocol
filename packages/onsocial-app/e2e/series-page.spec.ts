import { expect, test } from '@playwright/test';

/**
 * Smoke for the public series page shell after BIC chrome cleanup.
 * Synthetic empty series — no live drop cards required.
 */
const CREATOR = 'e2e.series.testnet';
const SERIES_ID = 'audit-series';
const SERIES_PATH = `/series/${encodeURIComponent(CREATOR)}/${encodeURIComponent(SERIES_ID)}`;

test.describe('series page', () => {
  test('loads brand hero and guest empty with shop exit', async ({ page }) => {
    await page.goto(SERIES_PATH, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: SERIES_ID })
    ).toBeVisible({
      timeout: 30_000,
    });
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
      page.getByRole('link', { name: 'Shop this creator' }).first()
    ).toHaveAttribute('href', `/market?creator=${encodeURIComponent(CREATOR)}`);

    await expect(
      page.getByText('No drops in this series yet.', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('When the next drop lands, it will show up here.', {
        exact: true,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Shop this creator' })
    ).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Edit series' })).toHaveCount(
      0
    );
  });

  test('document title includes Series · OnSocial', async ({ page }) => {
    await page.goto(SERIES_PATH, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(
      new RegExp(`${SERIES_ID} • Series • OnSocial`),
      { timeout: 30_000 }
    );
  });
});
