import { expect, test } from '@playwright/test';
import {
  clickTab,
  clickTabAndWaitUrl,
  expectChoiceMenuVisible,
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
  gotoApp,
  tablist,
} from './helpers';

/**
 * Smoke for Market discovery chrome — listing type, medium rail, deep-links.
 * Does not assert live indexer row content (network-dependent).
 */
test.describe('market discovery', () => {
  test('loads catalog chrome and switches medium + format', async ({
    page,
  }) => {
    await gotoApp(page, '/market');

    await expectSearchVisible(page, 'Search Market listings');

    await expectTabVisible(page, 'Listing type', 'All');
    await expectTabVisible(page, 'Listing type', 'Auctions');

    await expectTabVisible(page, 'Listing medium', 'Audio');
    await expectTabVisible(page, 'Listing medium', 'Thoughts');
    await expectTabVisible(page, 'Listing medium', 'Tickets');

    await clickTabAndWaitUrl(page, 'Listing medium', 'Audio', /kind=audio/);
    await expectTabVisible(page, 'Release format', 'Album');
    await expectTabVisible(page, 'Release format', 'Podcast');

    await clickTabAndWaitUrl(
      page,
      'Release format',
      'Podcast',
      /audioFormat=podcast/
    );
    await expectTabSelected(page, 'Release format', 'Podcast');
  });

  test('deep-links medium and audio format from the URL', async ({ page }) => {
    await gotoApp(page, '/market?kind=audio&audioFormat=podcast');
    await expectTabSelected(page, 'Listing medium', 'Audio');
    await expectTabSelected(page, 'Release format', 'Podcast');
  });

  test('deep-links tickets medium without seeding unfiltered rows', async ({
    page,
  }) => {
    await gotoApp(page, '/market?kind=ticket');
    await expectTabSelected(page, 'Listing medium', 'Tickets');
  });

  test('deep-links thoughts medium for primary post-mints', async ({
    page,
  }) => {
    await gotoApp(page, '/market?kind=thought');
    await expectTabSelected(page, 'Listing medium', 'Thoughts');
  });

  test('deep-links ending soon sort onto Auctions', async ({ page }) => {
    await gotoApp(page, '/market?sort=ending');
    await expectTabSelected(page, 'Listing type', 'Auctions');
    // ChoiceDrawerMenu a11y name is "Open sort menu"; visible label is Ending soon.
    await expectChoiceMenuVisible(page, 'Sort', {
      containsText: 'Ending soon',
    });
  });

  test('listing-type tab stays selected after flip', async ({ page }) => {
    await gotoApp(page, '/market');
    await expectTabVisible(page, 'Listing type', 'All');

    await clickTab(page, 'Listing type', 'Auctions');
    await expectTabSelected(page, 'Listing type', 'Auctions');

    await clickTab(page, 'Listing type', 'All');
    await expectTabSelected(page, 'Listing type', 'All');

    await expect(tablist(page, 'Listing type')).toBeVisible();
  });
});
