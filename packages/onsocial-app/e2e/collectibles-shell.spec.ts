import { expect, test, type Page } from '@playwright/test';
import { setE2eGraphVault } from './helpers/e2e-graph';
import {
  COLLECTIBLES_VAULT_OWNER,
  expectCollectiblesChrome,
  pickCollectiblesKindFromFilter,
  stubCollectiblesVaultGraph,
  stubCollectiblesVaultManyCreators,
} from './helpers/collectibles-vault';
import {
  expectOsEmptyAction,
  expectSearchHidden,
  expectSearchVisible,
  expectTabSelected,
  gotoApp,
  searchField,
} from './helpers';
import { marketFilterTrigger, openMarketFilter } from './helpers/market';

const KIND_RAIL = 'Collectible kind';

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
      page.getByText('Connect to open Collectibles.', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Connect' })
    ).toHaveCount(0);
    await expect(page.locator('.portfolio-summon-hint--connect')).toHaveText(
      'Connect'
    );
    await expectOsEmptyAction(
      page.getByRole('main').getByRole('link', { name: 'Browse Market' })
    );
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
    await expectOsEmptyAction(
      page.getByRole('main').getByRole('link', { name: 'Browse Market' })
    );
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
    await setE2eGraphVault(page, 'default');
    await stubCollectiblesVaultGraph(page);
    await gotoApp(page, `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`);

    await expect(page.getByText('Night Drive').first()).toBeVisible({
      timeout: 30_000,
    });
    await expectCollectiblesChrome(page);

    const kindRail = page.getByRole('tablist', { name: KIND_RAIL });
    await expect(kindRail.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(kindRail.getByRole('tab', { name: 'Writing' })).toBeVisible();
    await expect(kindRail.getByRole('tab', { name: 'Tickets' })).toBeVisible();
    await expect(
      kindRail.getByRole('tab', { name: 'Memberships' })
    ).toHaveCount(0);
    const allBox = await kindRail
      .getByRole('tab', { name: 'All' })
      .boundingBox();
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
    await expect(nightRow).toContainText('2 NEAR each');
    await expect(nightRow).not.toContainText('Listed');
    await expect(nightRow).not.toContainText('night-drive:');
    await nightRow
      .getByRole('button', { name: 'Choose an edition of Night Drive' })
      .click();
    const editions = page.getByRole('dialog', { name: 'Editions' });
    await expect(
      editions.getByText('Edition 1', { exact: true })
    ).toBeVisible();
    await expect(
      editions.getByText('Edition 3', { exact: true })
    ).toBeVisible();
    const covers = editions.locator('img.held-edition-cover');
    await expect(covers).toHaveCount(2);
    await expect(covers.nth(0)).toHaveAttribute('src', /111/);
    await expect(covers.nth(1)).toHaveAttribute('src', /333/);
    await expect(
      editions.getByRole('button', { name: 'Open Edition 1' })
    ).toBeVisible();
    await expect(
      editions.getByRole('button', { name: 'Open Edition 3' })
    ).toBeVisible();
    await expect(editions.locator('time')).toHaveCount(0);
    await expect(editions.getByText(/night-drive:/)).toHaveCount(0);
    const editionThree = editions.getByRole('button', {
      name: 'Open Edition 3',
    });
    await expect
      .poll(async () => {
        const first = await editions.boundingBox();
        await page.waitForTimeout(80);
        const second = await editions.boundingBox();
        return (
          first != null &&
          second != null &&
          Math.abs(first.y - second.y) < 0.5 &&
          second.y + second.height <= 846
        );
      })
      .toBe(true);
    const dock = page.locator('.portfolio-summon-dock').first();
    const editionBox = await editionThree.boundingBox();
    const dockBox = await dock.boundingBox();
    expect(editionBox).toBeTruthy();
    expect(dockBox).toBeTruthy();
    expect(editionBox!.y + editionBox!.height).toBeLessThanOrEqual(
      dockBox!.y + 1
    );
    await editions.getByRole('button', { name: 'More for Edition 1' }).click();
    const actions = page.getByRole('dialog', { name: 'Edition 1' });
    await expect
      .poll(async () => {
        const first = await actions.boundingBox();
        await page.waitForTimeout(80);
        const second = await actions.boundingBox();
        return (
          first != null &&
          second != null &&
          Math.abs(first.y - second.y) < 0.5 &&
          second.y + second.height <= 846
        );
      })
      .toBe(true);
    const history = actions.getByRole('menuitem', { name: 'History' });
    const factsItem = actions.getByRole('menuitem', { name: 'Facts' });
    await expect(
      actions.getByRole('menuitem', { name: 'Share' })
    ).toBeVisible();
    await expect(history).toBeVisible();
    await expect(factsItem).toBeVisible();
    await expect(
      actions.getByRole('menuitem', { name: 'Transfer' })
    ).toHaveCount(0);
    const factsBox = await factsItem.boundingBox();
    const menuBox = await actions.boundingBox();
    const menuDock = await page
      .locator('.portfolio-summon-dock')
      .first()
      .boundingBox();
    expect(factsBox).toBeTruthy();
    expect(menuBox).toBeTruthy();
    expect(menuDock).toBeTruthy();
    expect(factsBox!.y + factsBox!.height).toBeLessThanOrEqual(menuDock!.y + 1);
    expect(menuBox!.height).toBeLessThan(320);
    await factsItem.click();
    await expect(actions).toBeHidden();
    const facts = page.getByRole('dialog', { name: 'Facts' });
    await expect(facts.getByText('night-drive:1')).toBeVisible();
    await expect(facts.getByText('Minted')).toBeVisible();
    await expect(facts.getByText('Listed')).toHaveCount(0);
    await facts.getByRole('button', { name: 'Close facts' }).click();
    await expect(facts).toBeHidden();
    await expect(editions).toBeVisible();
    await expect(editions.getByText(/night-drive:/)).toHaveCount(0);
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await editions.getByRole('button', { name: 'More for Edition 1' }).click();
    const shareMenu = page.getByRole('dialog', { name: 'Edition 1' });
    await shareMenu.getByRole('menuitem', { name: 'Share' }).click();
    await expect(shareMenu).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('t=night-drive');
    await expect(editions).toBeVisible();
    await editions.getByRole('button', { name: 'Close editions' }).click();
    await expect(editions).toBeHidden();
    await expect(nightRow).not.toContainText('@alice.near');
    await nightRow.getByRole('button', { name: 'Play Night Drive' }).click();
    await expect(page.getByRole('dialog', { name: 'Editions' })).toBeVisible();
    await page
      .getByRole('dialog', { name: 'Editions' })
      .getByRole('button', { name: 'Close editions' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Editions' })).toBeHidden();

    const chapterRow = page.locator('.collectibles-holding-row').filter({
      hasText: 'Chapter One',
    });
    await expect(chapterRow).toContainText('Writing');
    await expect(chapterRow).not.toContainText('No.');
    await expect(chapterRow).not.toContainText('@alice.near');
    await expect(
      chapterRow.getByRole('button', { name: /Read Chapter One/ })
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
    const gateRow = page
      .locator('.collectibles-holding-row')
      .filter({ hasText: 'Gate Pass' });
    await expect(gateRow).toContainText('Tickets');
    await expect(
      gateRow.getByRole('button', { name: 'Show pass Gate Pass' })
    ).toBeVisible();
    await expect(
      gateRow.getByRole('link', { name: 'Open drop for Gate Pass' })
    ).toHaveAttribute('href', '/collection/gate-pass');
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
    await expect(page.getByText('No memberships held.')).toBeVisible();
    const showAll = page.getByRole('button', { name: 'Show all' });
    await expectOsEmptyAction(showAll);
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
      (url) => !url.searchParams.has('creator') && !url.searchParams.has('sort')
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
    await expect(page.locator('.market-listing-shimmer-time')).toHaveCount(6);
    await expect(page.getByRole('button', { name: /A–Z/ })).toBeVisible();
    await expect(page.locator('[data-collectibles-back]')).toHaveAttribute(
      'data-collectibles-back',
      `/@${COLLECTIBLES_VAULT_OWNER}?tab=collection`
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
    await expect(
      loadingRail.getByRole('tab', { name: 'Writing' })
    ).toBeVisible();
    await expect(loadingRail.getByRole('tab', { name: 'Audio' })).toBeVisible();
    await expect(
      loadingRail.getByRole('tab', { name: 'Tickets' })
    ).toBeVisible();
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
    await setE2eGraphVault(page, 'default');
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
      page
        .locator('.collectibles-holding-row')
        .filter({ hasText: 'Chapter One' })
    ).toHaveCount(0);
  });

  test('shows a jump rail once six creators are on the shelf', async ({
    page,
  }) => {
    await setE2eGraphVault(page, 'many-creators');
    await stubCollectiblesVaultManyCreators(page);
    await gotoApp(page, `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`);

    await expect(page.getByText('Drop 1').first()).toBeVisible({
      timeout: 30_000,
    });
    const jump = page.getByRole('listbox', { name: 'Jump to creator' });
    await expect(jump.first()).toBeVisible();
    await expect(
      jump.first().getByRole('option', { name: 'Finn' })
    ).toBeVisible();
    await jump.first().getByRole('option', { name: 'Finn' }).click();
    await expect(page.locator('#collectibles-from-finn-near')).toBeInViewport();
  });

  test('Show pass opens on the vault and close stays there', async ({
    page,
  }) => {
    await setE2eGraphVault(page, 'default');
    await stubCollectiblesVaultGraph(page);
    await gotoApp(page, `/@${COLLECTIBLES_VAULT_OWNER}/collectibles`);

    const gateRow = page
      .locator('.collectibles-holding-row')
      .filter({ hasText: 'Gate Pass' });
    await expect(gateRow).toBeVisible({ timeout: 30_000 });
    await gateRow.getByRole('button', { name: 'Show pass Gate Pass' }).click();

    const pass = page.locator('.ticket-show-pass');
    await expect(pass).toBeVisible();
    await expect(page).toHaveURL(/\/collectibles\/?(\?|$)/);
    await expect(page).not.toHaveURL(/\/collection\//);

    await page.getByRole('button', { name: 'Back from pass' }).click();
    await expect(pass).toHaveCount(0);
    await expect(gateRow).toBeVisible();
    await expect(page).toHaveURL(/\/collectibles/);

    await gateRow
      .getByRole('link', { name: 'Open drop for Gate Pass' })
      .click({ position: { x: 16, y: 16 } });
    await expect(page).toHaveURL(/\/collection\/gate-pass/);
  });
});
