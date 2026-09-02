import { expect, test, type Page } from '@playwright/test';
import {
  COLLECTIBLES_VAULT_OWNER,
  clickCollectiblesKindAndWaitUrl,
  expectCollectiblesChrome,
  stubCollectiblesVaultGraph,
} from './helpers/collectibles-vault';
import {
  expectSearchHidden,
  expectSearchVisible,
  expectTabSelected,
  gotoApp,
  searchField,
} from './helpers';

const KIND_RAIL = 'Collectible kind';
const PILL_ACTION = /page-drawer-section-action/;

async function expectEmptySitsUnderChrome(page: Page) {
  const empty = page.locator('.collectibles-page .market-page-empty');
  await expect(empty).toBeVisible();
  const box = await empty.boundingBox();
  expect(box).toBeTruthy();
  // Shared Market empty is 40vh (~337px on 844). Vault copy sits under chrome.
  expect(box!.height).toBeLessThan(200);
}

test.describe('collectibles shell', () => {
  test('hides discovery chrome on the disconnected OS vault', async ({
    page,
  }) => {
    await gotoApp(page, '/collectibles');

    await expect(
      page.getByText('Connect your wallet to open your Collectibles vault.')
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Connect' })
    ).toHaveClass(PILL_ACTION);
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Browse Market' })
    ).toHaveClass(PILL_ACTION);
    await expectEmptySitsUnderChrome(page);
    await expectSearchHidden(page, 'Search collectibles');
    await expect(page.getByRole('tablist', { name: KIND_RAIL })).toHaveCount(0);
    await expect(page.locator('[data-collectibles-ready]')).toHaveCount(0);
    await expect(page.locator('[data-collectibles-loading]')).toHaveCount(0);
  });

  test('hides discovery chrome on an empty visitor vault', async ({ page }) => {
    await gotoApp(page, '/@greenghost.testnet/collectibles');

    await expect(page.getByText('Nothing held yet.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Browse Market' })
    ).toHaveClass(PILL_ACTION);
    await expectEmptySitsUnderChrome(page);
    await expectSearchHidden(page, 'Search collectibles');
    await expect(page.getByRole('tablist', { name: KIND_RAIL })).toHaveCount(0);
    await expect(page.locator('[data-collectibles-ready]')).toHaveCount(0);
    await expect(page.locator('[data-collectibles-loading]')).toHaveCount(0);
  });

  test('populated vault shows rows, wraps kind chips, and persists search', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubCollectiblesVaultGraph(page);
    await gotoApp(
      page,
      `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`
    );

    await expect(page.getByText('Night Drive').first()).toBeVisible({
      timeout: 30_000,
    });
    await expectCollectiblesChrome(page);

    const memberships = page.getByRole('tab', { name: 'Memberships' });
    await expect(memberships).toHaveText('Memberships');
    const allBox = await page.getByRole('tab', { name: 'All' }).boundingBox();
    const membershipsBox = await memberships.boundingBox();
    expect(allBox).toBeTruthy();
    expect(membershipsBox).toBeTruthy();
    expect(membershipsBox!.y).toBeGreaterThan(allBox!.y);
    expect(membershipsBox!.width).toBeGreaterThan(48);
    expect(
      await memberships.evaluate(
        (el) =>
          (el as HTMLElement).scrollWidth <=
          (el as HTMLElement).clientWidth + 1
      )
    ).toBe(true);

    const nightRow = page.locator('.collectibles-holding-row').filter({
      hasText: 'Night Drive',
    });
    await expect(nightRow).toContainText('Audio');
    await expect(nightRow).toContainText('×2');
    await expect(nightRow).toContainText('Listed');
    await expect(nightRow).toContainText('2 NEAR');
    await expect(nightRow).toContainText('@alice.near');
    await expect(nightRow.getByRole('link', { name: /Play Night Drive/ })).toBeVisible();

    const chapterRow = page.locator('.collectibles-holding-row').filter({
      hasText: 'Chapter One',
    });
    await expect(chapterRow).toContainText('#4');
    await expect(chapterRow).toContainText('@alice.near');
    await expect(
      chapterRow.getByRole('link', { name: /Read Chapter One/ })
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Collectibles' })
    ).toBeVisible();

    await page.screenshot({
      path: `${testInfo.outputDir}/collectibles-populated-mobile.png`,
      fullPage: true,
    });

    await searchField(page, 'Search collectibles').fill('chapter');
    await page.waitForURL(/[?&]q=chapter/);
    await expect(page.locator('[data-collectibles-ready]')).toHaveCount(1);
    await expect(page.locator('[data-collectibles-loading]')).toHaveCount(0);
    await expect(page.locator('.market-listing-list--skeleton')).toHaveCount(0);
    await expect(nightRow).toHaveCount(0);
    await expect(chapterRow).toBeVisible();

    await searchField(page, 'Search collectibles').fill('zzznone');
    await page.waitForURL(/[?&]q=zzznone/);
    await expect(page.locator('.market-listing-list--skeleton')).toHaveCount(0);
    await expect(
      page.getByText('No collectibles match “zzznone”.')
    ).toBeVisible();
    const clearSearch = page
      .locator('.collectibles-page .market-page-empty')
      .getByRole('button', { name: 'Clear search' });
    await expect(clearSearch).toHaveClass(PILL_ACTION);
    await expectEmptySitsUnderChrome(page);
    await page.screenshot({
      path: `${testInfo.outputDir}/collectibles-empty-search.png`,
      fullPage: true,
    });
    await clearSearch.click();
    await page.waitForURL((url) => !url.searchParams.has('q'));
    await expect(nightRow).toBeVisible();
    await expectCollectiblesChrome(page);

    await clickCollectiblesKindAndWaitUrl(page, 'Memberships', 'membership');
    await expect(page.locator('[data-collectibles-ready]')).toHaveCount(1);
    await expect(page.locator('[data-collectibles-loading]')).toHaveCount(0);
    await expect(
      page.getByText('No memberships held.')
    ).toBeVisible();
    const showAll = page.getByRole('button', { name: 'Show all' });
    await expect(showAll).toHaveClass(PILL_ACTION);
    await expectEmptySitsUnderChrome(page);
    await page.screenshot({
      path: `${testInfo.outputDir}/collectibles-empty-filter.png`,
      fullPage: true,
    });
    await showAll.click();
    await page.waitForURL((url) => !url.searchParams.has('kind'));
    await expect(nightRow).toBeVisible();
    await expect(chapterRow).toBeVisible();
    await expectCollectiblesChrome(page);
  });

  test('deep-links kind from the URL without stacking loading chrome', async ({
    page,
  }) => {
    await stubCollectiblesVaultGraph(page);
    await gotoApp(
      page,
      `/@${COLLECTIBLES_VAULT_OWNER}/collectibles?kind=audio`
    );

    await expect(page.getByText('Night Drive').first()).toBeVisible({
      timeout: 30_000,
    });
    await expectCollectiblesChrome(page);
    await expectTabSelected(page, KIND_RAIL, 'Audio');
    await expectSearchVisible(page, 'Search collectibles');
    await expect(
      page.locator('.collectibles-holding-row').filter({ hasText: 'Chapter One' })
    ).toHaveCount(0);
  });
});
