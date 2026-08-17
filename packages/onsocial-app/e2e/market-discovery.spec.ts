import { expect, test } from '@playwright/test';

/**
 * Smoke for Market discovery chrome — listing type, medium rail, deep-links.
 * Does not assert live indexer row content (network-dependent).
 */
test.describe('market discovery', () => {
  test('loads catalog chrome and switches medium + format', async ({
    page,
  }) => {
    await page.goto('/market', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('textbox', { name: 'Search Market listings' })
    ).toBeVisible({ timeout: 30_000 });

    const listingType = page.getByRole('tablist', { name: 'Listing type' });
    await expect(listingType.getByRole('tab', { name: 'All' })).toBeVisible();
    await expect(
      listingType.getByRole('tab', { name: 'Auctions' })
    ).toBeVisible();

    const mediumRail = page.getByRole('tablist', { name: 'Listing medium' });
    await expect(mediumRail.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(mediumRail.getByRole('tab', { name: 'Events' })).toBeVisible();

    await mediumRail.getByRole('tab', { name: 'Audio' }).click();
    await page.waitForURL(/kind=audio/);
    const formatRail = page.getByRole('tablist', { name: 'Release format' });
    await expect(formatRail.getByRole('tab', { name: 'Album' })).toBeVisible();
    await expect(formatRail.getByRole('tab', { name: 'Podcast' })).toBeVisible();

    await formatRail.getByRole('tab', { name: 'Podcast' }).click();
    await page.waitForURL(/audioFormat=podcast/);
    await expect(formatRail.getByRole('tab', { name: 'Podcast' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('deep-links medium and audio format from the URL', async ({ page }) => {
    await page.goto('/market?kind=audio&audioFormat=podcast', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('tablist', { name: 'Listing medium' }).getByRole('tab', {
        name: 'Audio',
      })
    ).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(
      page.getByRole('tablist', { name: 'Release format' }).getByRole('tab', {
        name: 'Podcast',
      })
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('deep-links events medium without seeding unfiltered rows', async ({
    page,
  }) => {
    await page.goto('/market?kind=ticket', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('tablist', { name: 'Listing medium' }).getByRole('tab', {
        name: 'Events',
      })
    ).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
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
