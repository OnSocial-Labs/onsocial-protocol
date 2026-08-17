import { expect, test } from '@playwright/test';

/**
 * Smoke for Drops discovery chrome — sort / medium rails and search field.
 * Does not assert live indexer rows (network-dependent).
 */
test.describe('drops discovery', () => {
  test('loads catalog chrome and switches sort + medium', async ({ page }) => {
    await page.goto('/drops', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('textbox', { name: 'Search drops' })).toBeVisible({
      timeout: 30_000,
    });

    const sortRail = page.getByRole('tablist', { name: 'Drop sort' });
    await expect(sortRail.getByRole('tab', { name: 'Live' })).toBeVisible();
    await expect(sortRail.getByRole('tab', { name: 'Upcoming' })).toBeVisible();

    await sortRail.getByRole('tab', { name: 'Upcoming' }).click();
    await page.waitForURL(/sort=upcoming/);
    await expect(
      sortRail.getByRole('tab', { name: 'Upcoming' })
    ).toHaveAttribute('aria-selected', 'true');

    const mediumRail = page.getByRole('tablist', { name: 'Drop medium' });
    await expect(mediumRail.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(mediumRail.getByRole('tab', { name: 'Events' })).toBeVisible();

    await mediumRail.getByRole('tab', { name: 'Audio' }).click();
    await page.waitForURL(/kind=audio/);
    await expect(
      page.getByRole('tablist', { name: 'Release format' })
    ).toBeVisible();
    await expect(
      page.getByRole('tablist', { name: 'Release format' }).getByRole('tab', {
        name: 'Album',
      })
    ).toBeVisible();
  });

  test('deep-links sort and medium from the URL', async ({ page }) => {
    await page.goto('/drops?sort=closing&kind=ticket', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('tablist', { name: 'Drop sort' }).getByRole('tab', {
        name: 'Closing',
      })
    ).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(
      page.getByRole('tablist', { name: 'Drop medium' }).getByRole('tab', {
        name: 'Events',
      })
    ).toHaveAttribute('aria-selected', 'true');
  });
});
