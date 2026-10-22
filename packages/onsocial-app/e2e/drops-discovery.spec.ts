import { expect, test } from '@playwright/test';
import { setE2eGraphDrops } from './helpers/e2e-graph';
import {
  clickDropsSortAndWaitUrl,
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

  test('the row opens the drop, without a Collect pill', async ({ page }) => {
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);
    await expect(
      page.getByRole('heading', { name: 'Top earners' })
    ).toHaveCount(0);
    await expect(page.locator('.drops-discovery-row--featured')).toHaveCount(0);
    await expect(page.getByText('Featured · Closing')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Mint / })).toHaveCount(0);
    await expect(
      page.locator('.drops-discovery-row .os-row-action')
    ).toHaveCount(0);
    const rowCount = await page.locator('.drops-discovery-row').count();
    if (rowCount > 0) {
      await expect(
        page.locator('.drops-discovery-row .market-listing-row-open').first()
      ).toHaveAttribute('href', /\/collection\//);
    }
  });

  test('loads catalog chrome and switches sort + medium', async ({ page }) => {
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);

    await clickDropsSortAndWaitUrl(page, 'Upcoming', 'upcoming');
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

  test('ticket medium opens the Events list', async ({ page }) => {
    await gotoApp(page, '/drops?sort=closing&kind=ticket');
    await expect(page).toHaveURL(/\/events(?:\?|$)/);
    await expect(page.getByRole('link', { name: 'New event' })).toBeVisible();
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

    await clickDropsSortAndWaitUrl(page, 'New', 'new');
    await clickDropsSortAndWaitUrl(page, 'Live', null);

    await expectDropsChrome(page);
    await expectTabSelected(page, 'Drop sort', 'Live');
  });

  test('cover opens the medium and title still opens the drop', async ({
    page,
  }) => {
    await setE2eGraphDrops(page, 'covers');
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);

    const nightRow = page
      .locator('.drops-discovery-row')
      .filter({ hasText: 'Night Drive' });
    const party = nightRow.locator('.drops-discovery-party');
    await expect(party).toHaveAttribute('href', '/@alice.near');
    const partyBox = await party.boundingBox();
    const rowBox = await nightRow.boundingBox();
    expect(partyBox && rowBox && partyBox.width < rowBox.width * 0.7).toBe(
      true
    );

    const listen = page.getByRole('button', { name: 'Listen to Night Drive' });
    const read = page.getByRole('button', { name: 'Read Chapter One' });
    const view = page.getByRole('button', { name: 'View Quiet Print' });
    await expect(listen).toBeVisible();
    await expect(read).toBeVisible();
    await expect(view).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open Night Drive' })
    ).toHaveAttribute('href', '/collection/night-drive');
    await expect(
      page.getByRole('link', { name: 'Open Chapter One' })
    ).toHaveAttribute('href', '/collection/chapter-one');
    await expect(
      page.getByRole('link', { name: 'Collect Chapter One' })
    ).toHaveCount(0);

    await listen.click();
    await expect(
      page.getByRole('button', { name: 'Back from listen' })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/drops(?:\?|$)/);
    await page.getByRole('button', { name: 'Back from listen' }).click();
    await expect(listen).toBeVisible();

    await read.click();
    await expect(
      page.getByRole('button', { name: 'Back from article' })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/drops(?:\?|$)/);
    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(read).toBeVisible();

    await view.click();
    const art = page.getByRole('dialog', { name: 'Quiet Print' });
    await expect(art).toBeVisible();
    await expect(page).toHaveURL(/\/drops(?:\?|$)/);
    await art.getByRole('button', { name: 'Back' }).click();
    await expect(view).toBeVisible();

    await page.getByRole('link', { name: 'Open Chapter One' }).click();
    await expect(page).toHaveURL(/\/collection\/chapter-one(?:\?|$)/);
  });
});
