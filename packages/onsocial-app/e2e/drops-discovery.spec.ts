import { expect, test } from '@playwright/test';
import {
  clickTab,
  clickTabAndWaitUrl,
  closeMarketFilter,
  expectDropsChrome,
  expectMarketFilterSummary,
  expectMediumSelected,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
  openMarketFilter,
  pickMediumAndWaitUrl,
  tab,
} from './helpers';

/**
 * Drops load + layout — sort rail, Filter drawer (medium / format), deep-links.
 * Does not assert live indexer row titles (network-dependent).
 */
test.describe('drops discovery', () => {
  test('paints search, sort rail, and filter', async ({ page }) => {
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);
    await expect(
      page.getByRole('button', { name: /Open filter menu, Filter/ })
    ).toBeVisible();
  });

  test('loads catalog chrome and switches sort + medium', async ({ page }) => {
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);

    await clickTabAndWaitUrl(page, 'Drop sort', 'Upcoming', /sort=upcoming/);
    await expectTabSelected(page, 'Drop sort', 'Upcoming');
    await expect(page.locator('[data-drops-ready]')).toHaveCount(1);
    await expect(page.locator('[data-drops-loading]')).toHaveCount(0);

    await openMarketFilter(page);
    await expectMediumSelected(page, 'All');
    await pickMediumAndWaitUrl(page, 'Audio', /kind=audio/);
    await expectMediumSelected(page, 'Audio');

    await expectTabVisible(page, 'Release format', 'Album');
    await expectTabVisible(page, 'Release format', 'Podcast');
    await tab(page, 'Release format', 'Album').click();
    await page.waitForURL(/audioFormat=album/);
    await expectTabSelected(page, 'Release format', 'Album');
    await closeMarketFilter(page);
    await expectMarketFilterSummary(page, /Audio/);
    await expect(page.locator('[data-drops-ready]')).toHaveCount(1);
    await expect(page.locator('[data-drops-loading]')).toHaveCount(0);
  });

  test('deep-links sort and medium from the URL', async ({ page }) => {
    await gotoApp(page, '/drops?sort=closing&kind=ticket');
    await expectDropsChrome(page);
    await expectTabSelected(page, 'Drop sort', 'Closing');
    await expectMarketFilterSummary(page, 'Tickets');
  });

  test('deep-links audio format under Audio medium', async ({ page }) => {
    await gotoApp(page, '/drops?kind=audio&audioFormat=podcast');
    await expectDropsChrome(page);
    await expectMarketFilterSummary(page, /Audio/);
    await expectMarketFilterSummary(page, /Podcast/);
  });

  test('flip-back keeps catalog chrome without blanking search', async ({
    page,
  }) => {
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);
    await expectTabVisible(page, 'Drop sort', 'Live');

    await clickTab(page, 'Drop sort', 'New');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sort'))
      .toBe('new');
    await clickTab(page, 'Drop sort', 'Live');
    await expect
      .poll(() => new URL(page.url()).searchParams.has('sort'))
      .toBe(false);

    await expectDropsChrome(page);
    await expectTabSelected(page, 'Drop sort', 'Live');
  });
});
