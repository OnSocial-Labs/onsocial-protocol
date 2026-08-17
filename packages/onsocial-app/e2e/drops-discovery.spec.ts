import { expect, test } from '@playwright/test';

/**
 * Smoke for Drops discovery chrome — sort / medium rails, formats, deep-links.
 * Does not assert live indexer row content (network-dependent).
 */
test.describe('drops discovery', () => {
  test('loads catalog chrome and switches sort + medium', async ({ page }) => {
    await page.goto('/drops', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('textbox', { name: 'Search drops' })
    ).toBeVisible({ timeout: 30_000 });

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
    await expect(mediumRail.getByRole('tab', { name: 'Tickets' })).toBeVisible();

    await mediumRail.getByRole('tab', { name: 'Audio' }).click();
    await page.waitForURL(/kind=audio/);
    const formatRail = page.getByRole('tablist', { name: 'Release format' });
    await expect(formatRail).toBeVisible();
    await expect(formatRail.getByRole('tab', { name: 'Album' })).toBeVisible();
    await expect(formatRail.getByRole('tab', { name: 'Podcast' })).toBeVisible();

    await formatRail.getByRole('tab', { name: 'Album' }).click();
    await page.waitForURL(/audioFormat=album/);
    await expect(formatRail.getByRole('tab', { name: 'Album' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
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
        name: 'Tickets',
      })
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('deep-links audio format under Audio medium', async ({ page }) => {
    await page.goto('/drops?kind=audio&audioFormat=podcast', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('tablist', { name: 'Drop medium' }).getByRole('tab', {
        name: 'Audio',
      })
    ).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    await expect(
      page.getByRole('tablist', { name: 'Release format' }).getByRole('tab', {
        name: 'Podcast',
      })
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('flip-back keeps catalog chrome without blanking search', async ({
    page,
  }) => {
    await page.goto('/drops', { waitUntil: 'domcontentloaded' });
    const sortRail = page.getByRole('tablist', { name: 'Drop sort' });
    await expect(sortRail.getByRole('tab', { name: 'Live' })).toBeVisible({
      timeout: 30_000,
    });

    await sortRail.getByRole('tab', { name: 'New' }).click();
    await page.waitForURL(/sort=new/);
    await sortRail.getByRole('tab', { name: 'Live' }).click();
    await page.waitForURL((url) => !url.searchParams.has('sort'));

    await expect(
      page.getByRole('textbox', { name: 'Search drops' })
    ).toBeVisible();
    await expect(sortRail.getByRole('tab', { name: 'Live' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
