import { expect, test } from '@playwright/test';
import {
  clickTab,
  closeMarketFilter,
  expectChoiceMenuVisible,
  expectMarketChrome,
  expectMarketFilterSummary,
  expectMediumSelected,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
  marketListSkeleton,
  marketListingResults,
  openMarketFilter,
  pickMediumAndWaitUrl,
  tab,
  tablist,
} from './helpers';

/**
 * Market load + layout — listing-type rail, Filter drawer (medium / format),
 * sort, deep-links. Does not assert live indexer row titles (network-dependent).
 */
test.describe('market discovery', () => {
  test('paints search, listing-type rail, filter, and sort', async ({
    page,
  }) => {
    await gotoApp(page, '/market');
    await expectMarketChrome(page);
    await expect(
      page.getByRole('button', { name: /Open filter menu, Filter/ })
    ).toBeVisible();
  });

  test('loads catalog chrome and switches medium + format', async ({
    page,
  }) => {
    await gotoApp(page, '/market');
    await expectMarketChrome(page);

    await openMarketFilter(page);
    await expectMediumSelected(page, 'All');
    await pickMediumAndWaitUrl(page, 'Audio', /kind=audio/);
    await expectMediumSelected(page, 'Audio');

    await expectTabVisible(page, 'Release format', 'Album');
    await expectTabVisible(page, 'Release format', 'Podcast');
    await tab(page, 'Release format', 'Podcast').click();
    await page.waitForURL(/audioFormat=podcast/);
    await expectTabSelected(page, 'Release format', 'Podcast');
    await closeMarketFilter(page);
    await expectMarketFilterSummary(page, /Audio/);
    await expect(page.locator('[data-market-ready]')).toHaveCount(1);
    await expect(page.locator('[data-market-loading]')).toHaveCount(0);
  });

  test('deep-links medium and audio format from the URL', async ({ page }) => {
    await gotoApp(page, '/market?kind=audio&audioFormat=podcast');
    await expectMarketChrome(page);
    await expectMarketFilterSummary(page, /Audio/);
    await expectMarketFilterSummary(page, /Podcast/);
  });

  test('deep-links tickets medium without seeding unfiltered rows', async ({
    page,
  }) => {
    await gotoApp(page, '/market?kind=ticket');
    await expectMarketChrome(page);
    await expectMarketFilterSummary(page, 'Tickets');

    // SSR seed matches ?kind=ticket. Ready paint is ticket rows, empty copy,
    // or Retry — not an All catalog under Tickets.
    const emptyTickets = page.getByText(/Nothing in Tickets right now/);
    const ticketRow = marketListingResults(page).locator('.market-listing-row');
    const loadError = page.getByText(/Couldn’t load listings/);
    await expect(emptyTickets.or(ticketRow.first()).or(loadError)).toBeVisible();
    await expect(marketListSkeleton(page)).toHaveCount(0);
  });

  test('deep-links thoughts medium for primary post-mints', async ({
    page,
  }) => {
    await gotoApp(page, '/market?kind=thought');
    await expectMarketChrome(page);
    await expectMarketFilterSummary(page, 'Thoughts');
    const emptyThoughts = page.getByText(/Nothing in Thoughts right now/);
    const thoughtRow = marketListingResults(page).locator('.market-listing-row');
    const loadError = page.getByText(/Couldn’t load listings/);
    await expect(emptyThoughts.or(thoughtRow.first()).or(loadError)).toBeVisible();
  });

  test('deep-links ending soon sort onto Auctions', async ({ page }) => {
    await gotoApp(page, '/market?sort=ending');
    await expectMarketChrome(page);
    await expectTabSelected(page, 'Listing type', 'Auctions');
    await expectChoiceMenuVisible(page, 'Sort', {
      containsText: 'Ending soon',
    });
  });

  test('listing-type tab stays selected after flip', async ({ page }) => {
    await gotoApp(page, '/market');
    await expectMarketChrome(page);
    await expectTabVisible(page, 'Listing type', 'All');

    await clickTab(page, 'Listing type', 'Auctions');
    await expectTabSelected(page, 'Listing type', 'Auctions');

    await clickTab(page, 'Listing type', 'All');
    await expectTabSelected(page, 'Listing type', 'All');

    await expect(tablist(page, 'Listing type')).toBeVisible();
  });
});
