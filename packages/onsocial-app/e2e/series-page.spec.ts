import { expect, test } from '@playwright/test';

/**
 * Smoke for the public series page shell.
 * Uses a synthetic creator/series so chrome stays network-light (empty catalog).
 * Does not assert live drop cards, section buckets, or owner edit/branding.
 */
const CREATOR = 'e2e.series.testnet';
const SERIES_ID = 'audit-series';
const SERIES_PATH = `/series/${encodeURIComponent(CREATOR)}/${encodeURIComponent(SERIES_ID)}`;

test.describe('series page', () => {
  test('loads hero chrome and empty catalog for an unknown series', async ({
    page,
  }) => {
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
      page.getByRole('link', { name: 'Shop this creator' })
    ).toHaveAttribute('href', `/market?creator=${encodeURIComponent(CREATOR)}`);

    await expect(
      page.getByText('No drops in this series yet.', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit series' })).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Create a drop' })).toHaveCount(
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

  test('encodes creator and series id in the path', async ({ page }) => {
    const creator = 'e2e series.testnet';
    const seriesId = 'line one';
    await page.goto(
      `/series/${encodeURIComponent(creator)}/${encodeURIComponent(seriesId)}`,
      { waitUntil: 'domcontentloaded' }
    );

    await expect(
      page.getByRole('heading', { level: 1, name: seriesId })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('link', { name: 'Shop this creator' })
    ).toHaveAttribute('href', `/market?creator=${encodeURIComponent(creator)}`);
  });
});
