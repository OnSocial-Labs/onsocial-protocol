import { expect, test, type Page } from '@playwright/test';
import {
  COLLECTIBLES_VAULT_OWNER,
  expectCollectiblesChrome,
  pickCollectiblesKindFromFilter,
  stubCollectiblesVaultGraph,
  stubCollectiblesVaultManyCreators,
} from './helpers/collectibles-vault';
import {
  expectSearchHidden,
  expectSearchVisible,
  expectTabSelected,
  gotoApp,
  searchField,
} from './helpers';
import { marketFilterTrigger, openMarketFilter } from './helpers/market';

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

  test('populated vault shows a held-kinds rail and persists search', async ({
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

    const kindRail = page.getByRole('tablist', { name: KIND_RAIL });
    await expect(kindRail.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(kindRail.getByRole('tab', { name: 'Writing' })).toBeVisible();
    await expect(kindRail.getByRole('tab', { name: 'Tickets' })).toBeVisible();
    await expect(kindRail.getByRole('tab', { name: 'Memberships' })).toHaveCount(
      0
    );
    const allBox = await kindRail.getByRole('tab', { name: 'All' }).boundingBox();
    const ticketsBox = await kindRail
      .getByRole('tab', { name: 'Tickets' })
      .boundingBox();
    expect(allBox).toBeTruthy();
    expect(ticketsBox).toBeTruthy();
    expect(Math.abs(ticketsBox!.y - allBox!.y)).toBeLessThan(8);

    const nightRow = page.locator('.collectibles-holding-row').filter({
      hasText: 'Night Drive',
    });
    await expect(nightRow).toContainText('Audio');
    await expect(nightRow).toContainText('×2');
    await expect(nightRow).not.toContainText('Listed');
    await expect(nightRow).not.toContainText('NEAR');
    await expect(nightRow).not.toContainText('@alice.near');
    await expect(nightRow.getByRole('link', { name: /Play Night Drive/ })).toBeVisible();

    const chapterRow = page.locator('.collectibles-holding-row').filter({
      hasText: 'Chapter One',
    });
    await expect(chapterRow).toContainText('#4');
    await expect(chapterRow).not.toContainText('@alice.near');
    await expect(
      chapterRow.getByRole('link', { name: /Read Chapter One/ })
    ).toBeVisible();
    const aliceHeading = page.locator('#collectibles-from-alice-near');
    const bobHeading = page.locator('#collectibles-from-bob-near');
    await expect(aliceHeading).toBeVisible();
    await expect(aliceHeading).toContainText('Alice');
    await expect(aliceHeading).toContainText('3');
    await expect(bobHeading).toBeVisible();
    await expect(bobHeading).toContainText('1');
    await expect(aliceHeading).toHaveAttribute('aria-pressed', 'false');
    const seriesLink = page.getByRole('link', { name: /Night Roads/ });
    await expect(seriesLink).toBeVisible();
    await expect(seriesLink).toHaveAttribute(
      'href',
      `/series/${encodeURIComponent('alice.near')}/night-roads`
    );
    await expect(
      page.locator('.collectibles-holding-row').filter({ hasText: 'Dusk Run' })
    ).toBeVisible();
    await expect(
      page.locator('.collectibles-holding-row').filter({ hasText: 'Gate Pass' })
    ).toContainText('Tickets');
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
    await expect(page.getByText('No matches.')).toBeVisible();
    const clearSearch = page.getByRole('button', { name: 'Clear search' });
    await page.screenshot({
      path: `${testInfo.outputDir}/collectibles-empty-search.png`,
      fullPage: true,
    });
    await clearSearch.click();
    await page.waitForURL((url) => !url.searchParams.has('q'));
    await expect(nightRow).toBeVisible();
    await expectCollectiblesChrome(page);

    await pickCollectiblesKindFromFilter(page, 'Memberships', 'membership');
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

    await searchField(page, 'Search collectibles').fill('night roads');
    await page.waitForURL(/[?&]q=night(\+|%20)roads/);
    await expect(nightRow).toBeVisible();
    await expect(
      page.locator('.collectibles-holding-row').filter({ hasText: 'Dusk Run' })
    ).toBeVisible();
    await expect(chapterRow).toHaveCount(0);
    await expect(
      page.locator('.collectibles-holding-row').filter({ hasText: 'Gate Pass' })
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.waitForURL((url) => !url.searchParams.has('q'));

    await bobHeading.click();
    await page.waitForURL(/[?&]creator=bob\.near/);
    await expect(
      page.locator('.collectibles-holding-row').filter({ hasText: 'Gate Pass' })
    ).toBeVisible();
    await expect(nightRow).toHaveCount(0);
    await expect(bobHeading).toHaveAttribute('aria-pressed', 'true');
    await openMarketFilter(page);
    await expect(page.getByRole('option', { name: 'Newest' })).toBeVisible();
    await page.getByRole('option', { name: 'A–Z' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForURL(/[?&]sort=name/);
    await expect(page.getByRole('button', { name: /A–Z/ })).toBeVisible();
    await openMarketFilter(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForURL(
      (url) =>
        !url.searchParams.has('creator') && !url.searchParams.has('sort')
    );
    await expect(nightRow).toBeVisible();
    await expectCollectiblesChrome(page);
  });

  test('opening a filtered vault paints a library skeleton and query chrome', async ({
    page,
  }) => {
    await page.route('**/api/onapi/graph/query', async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 45_000);
      });
      await route.abort();
    });
    await gotoApp(
      page,
      `/@${COLLECTIBLES_VAULT_OWNER}/collectibles?kind=audio&sort=name&q=night`
    );

    const skeleton = page.locator('[data-collectibles-library-skeleton]');
    await expect(skeleton).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('.collectibles-library-heading--skeleton')
    ).toHaveCount(2);
    await expect(
      page.locator('.collectibles-library-series-heading--skeleton')
    ).toHaveCount(1);
    await expect(page.locator('.market-listing-row--skeleton')).toHaveCount(6);
    await expectSearchVisible(page, 'Search collectibles');
    await expect(searchField(page, 'Search collectibles')).toHaveValue('night');
    await expectTabSelected(page, KIND_RAIL, 'Audio');
    await expect(
      page.getByRole('tablist', { name: KIND_RAIL }).getByRole('tab', {
        name: 'Memberships',
      })
    ).toHaveCount(0);
    await expect(page.locator('.market-listing-shimmer-time')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /A–Z/ })).toBeVisible();
    await expect(page.locator('[data-collectibles-back]')).toHaveAttribute(
      'data-collectibles-back',
      `/@${COLLECTIBLES_VAULT_OWNER}`
    );
    await page.unroute('**/api/onapi/graph/query');
  });

  test('hard refresh of a filtered vault keeps held-kinds chrome', async ({
    page,
  }, testInfo) => {
    await stubCollectiblesVaultGraph(page);
    await gotoApp(
      page,
      `/@${COLLECTIBLES_VAULT_OWNER}/collectibles?kind=audio`
    );
    await expect(page.getByText('Night Drive').first()).toBeVisible({
      timeout: 30_000,
    });
    await expectTabSelected(page, KIND_RAIL, 'Audio');
    const readyRail = page.getByRole('tablist', { name: KIND_RAIL });
    await expect(readyRail.getByRole('tab', { name: 'Writing' })).toBeVisible();
    await expect(readyRail.getByRole('tab', { name: 'Tickets' })).toBeVisible();

    const heldCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'onsocial-collectibles-held'
    );
    expect(heldCookie?.value).toBeTruthy();
    expect(decodeURIComponent(heldCookie!.value)).toMatch(/writing/);
    expect(decodeURIComponent(heldCookie!.value)).toMatch(/audio/);
    expect(decodeURIComponent(heldCookie!.value)).toMatch(/ticket/);

    await page.unroute('**/api/onapi/graph/query');
    await page.route('**/api/onapi/graph/query', async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 45_000);
      });
      await route.abort();
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    const skeleton = page.locator('[data-collectibles-library-skeleton]');
    await expect(skeleton).toBeVisible({ timeout: 15_000 });
    await expectTabSelected(page, KIND_RAIL, 'Audio');
    const loadingRail = page.getByRole('tablist', { name: KIND_RAIL });
    await expect(loadingRail.getByRole('tab', { name: 'Writing' })).toBeVisible();
    await expect(loadingRail.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(loadingRail.getByRole('tab', { name: 'Tickets' })).toBeVisible();
    await expect(
      loadingRail.getByRole('tab', { name: 'Memberships' })
    ).toHaveCount(0);
    await expect(marketFilterTrigger(page)).toBeVisible();
    await page.screenshot({
      path: `${testInfo.outputDir}/collectibles-hard-refresh-held-kinds.png`,
      fullPage: true,
    });
    await page.unroute('**/api/onapi/graph/query');
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

  test('shows a jump rail once six creators are on the shelf', async ({
    page,
  }) => {
    await stubCollectiblesVaultManyCreators(page);
    await gotoApp(page, `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`);

    await expect(page.getByText('Drop 1').first()).toBeVisible({
      timeout: 30_000,
    });
    const jump = page.getByRole('listbox', { name: 'Jump to creator' });
    await expect(jump.first()).toBeVisible();
    await expect(jump.first().getByRole('option', { name: 'Finn' })).toBeVisible();
    await jump.first().getByRole('option', { name: 'Finn' }).click();
    await expect(page.locator('#collectibles-from-finn-near')).toBeInViewport();
  });
});
