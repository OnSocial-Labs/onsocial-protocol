import { expect, test } from '@playwright/test';

/**
 * Smoke for Market discovery chrome — listing type, filter drawer, deep-links.
 * Does not assert live indexer row content (network-dependent).
 */
test.describe('market discovery', () => {
  test('loads catalog chrome and opens medium filter', async ({ page }) => {
    await page.goto('/market', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('textbox', { name: 'Search Market listings' })
    ).toBeVisible({ timeout: 30_000 });

    const listingType = page.getByRole('tablist', { name: 'Listing type' });
    await expect(listingType.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(
      listingType.getByRole('tab', { name: 'Auctions' })
    ).toBeVisible();

    await page.getByRole('button', { name: /Open filter menu/ }).click();
    const medium = page.getByRole('listbox', { name: 'Medium' });
    await expect(medium.getByRole('option', { name: 'Audio' })).toBeVisible();
    await expect(medium.getByRole('option', { name: 'Tickets' })).toBeVisible();

    await medium.getByRole('option', { name: 'Audio' }).click();
    await page.waitForURL(/kind=audio/);

    const format = page.getByRole('tablist', { name: 'Release format' });
    await expect(format.getByRole('tab', { name: 'Album' })).toBeVisible();
    await expect(format.getByRole('tab', { name: 'Podcast' })).toBeVisible();

    await format.getByRole('tab', { name: 'Podcast' }).click();
    await page.waitForURL(/audioFormat=podcast/);
    await expect(format.getByRole('tab', { name: 'Podcast' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('deep-links medium and audio format from the URL', async ({ page }) => {
    await page.goto('/market?kind=audio&audioFormat=podcast', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('textbox', { name: 'Search Market listings' })
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('button', { name: /Open filter menu, Audio · Podcast/ })
    ).toBeVisible();
  });

  test('deep-links ticket medium without seeding unfiltered rows', async ({
    page,
  }) => {
    await page.goto('/market?kind=ticket', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('button', { name: /Open filter menu, Tickets/ })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('listing-type tab stays selected after flip', async ({ page }) => {
    await page.goto('/market', { waitUntil: 'domcontentloaded' });
    const listingType = page.getByRole('tablist', { name: 'Listing type' });
    await expect(listingType.getByRole('tab', { name: 'All' })).toBeVisible({
      timeout: 30_000,
    });

    await listingType.getByRole('tab', { name: 'Auctions' }).click();
    await expect(
      listingType.getByRole('tab', { name: 'Auctions' })
    ).toHaveAttribute('aria-selected', 'true');

    await listingType.getByRole('tab', { name: 'All' }).click();
    await expect(listingType.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
