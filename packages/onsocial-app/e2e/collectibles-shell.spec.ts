import { expect, test } from '@playwright/test';
import {
  COLLECTIBLES_VAULT_OWNER,
  stubCollectiblesVaultGraph,
} from './helpers/collectibles-vault';
import {
  expectSearchHidden,
  expectSearchVisible,
  expectTabVisible,
  gotoApp,
  searchField,
} from './helpers';

const KIND_RAIL = 'Collectible kind';

test.describe('collectibles shell', () => {
  test('hides discovery chrome on the disconnected OS vault', async ({
    page,
  }) => {
    await gotoApp(page, '/collectibles');

    await expect(
      page.getByText('Connect your wallet to open your Collectibles vault.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Browse Market' })
    ).toBeVisible();
    await expectSearchHidden(page, 'Search collectibles');
    await expect(page.getByRole('tablist', { name: KIND_RAIL })).toHaveCount(0);
  });

  test('hides discovery chrome on an empty visitor vault', async ({ page }) => {
    await gotoApp(page, '/@greenghost.testnet/collectibles');

    await expect(page.getByText('Nothing held yet.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('link', { name: 'Browse Market' })
    ).toBeVisible();
    await expectSearchHidden(page, 'Search collectibles');
    await expect(page.getByRole('tablist', { name: KIND_RAIL })).toHaveCount(0);
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
    await expectSearchVisible(page, 'Search collectibles');
    await expectTabVisible(page, KIND_RAIL, 'All');
    await expectTabVisible(page, KIND_RAIL, 'Memberships');

    const memberships = page.getByRole('tab', { name: 'Memberships' });
    await expect(memberships).toHaveText('Memberships');
    const allBox = await page.getByRole('tab', { name: 'All' }).boundingBox();
    const membershipsBox = await memberships.boundingBox();
    expect(allBox).toBeTruthy();
    expect(membershipsBox).toBeTruthy();
    expect(membershipsBox!.y).toBeGreaterThan(allBox!.y);
    expect(
      await memberships.evaluate(
        (el) => (el as HTMLElement).scrollWidth <= (el as HTMLElement).clientWidth + 1
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

    await page.screenshot({
      path: `${testInfo.outputDir}/collectibles-populated-mobile.png`,
      fullPage: true,
    });

    await searchField(page, 'Search collectibles').fill('chapter');
    await page.waitForURL(/[?&]q=chapter/);
    await expect(nightRow).toHaveCount(0);
    await expect(chapterRow).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.waitForURL((url) => !url.searchParams.has('q'));
    await expect(nightRow).toBeVisible();
  });
});
