import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { expectMarketChrome } from './helpers/market';
import { expectDropsChrome } from './helpers';
import { setE2eGraphDrops, setE2eGraphMarket } from './helpers/e2e-graph';
import { E2E_MARKET_WINDOW_COUNT } from '../src/lib/e2e-graph-stubs';

/**
 * Catalog windowing — market / drops / events / vault listing lists share
 * the feed-window core: past the row threshold (30), far rows collapse into
 * spacer divs and rematerialize on scroll back. The market page stacks two
 * lists (live above ended), so it also proves each list windows against its
 * own top inside the shared scroll body, not the scroll body's top.
 */

const ROW_COUNT = E2E_MARKET_WINDOW_COUNT;

test.describe('catalog windowing', () => {
  test('market stacks live + ended lists, each windowed against its own top', async ({
    page,
  }) => {
    await setE2eGraphMarket(page, 'window');
    await gotoApp(page, '/market');
    await dismissNextDevOverlay(page);
    await expectMarketChrome(page);

    const results = page.locator('#market-listing-results');
    const liveGroup = results.locator('[data-market-listing-group="live"]');
    const endedGroup = results.locator('[data-market-listing-group="ended"]');
    await expect(liveGroup).toBeVisible({ timeout: 30_000 });
    await expect(endedGroup).toBeVisible();
    const liveRow = (index: number) =>
      liveGroup.locator(`[data-catalog-key="native:e2e-win-live:${index}"]`);
    const endedRow = (index: number) =>
      endedGroup.locator(`[data-catalog-key="auction:e2e-win-ended:${index}"]`);
    const liveRowCount = () => liveGroup.locator('[data-catalog-key]').count();
    const endedRowCount = () =>
      endedGroup.locator('[data-catalog-key]').count();

    // Both lists cross the threshold — the window engages and far rows
    // collapse into bottom spacers. The ended list sits ~44 rows below the
    // viewport, so only its head renders.
    await expect(liveRow(0)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(liveRowCount, { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect
      .poll(endedRowCount, { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect(
      liveGroup.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);

    // Host-offset proof: bring the Ended label into view. The ended list
    // must window from its own top — lot 0 painted, the tail still collapsed.
    // Against the scroll body's top this scroll position would render rows
    // from the middle of the ended list instead.
    await page.locator('[data-market-ended-label]').scrollIntoViewIfNeeded();
    await expect(endedRow(0)).toBeVisible({ timeout: 15_000 });
    await expect(endedRow(ROW_COUNT - 1)).toHaveCount(0);

    // Deep scroll — the ended tail materializes, live rows fully collapse.
    // Spacer heights settle as measurements stream in, growing scrollHeight
    // after each pass, so keep scrolling until the tail row renders.
    const scroller = page.locator('.os-app-screen-body');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      if ((await endedRow(ROW_COUNT - 1).count()) > 0) break;
      await page.waitForTimeout(300);
    }
    await expect(endedRow(ROW_COUNT - 1)).toBeVisible({ timeout: 15_000 });
    await expect(endedRow(0)).toHaveCount(0);
    // The window always keeps one anchor row — the live head is gone and
    // only the clamped tail row remains from the far-away live list.
    await expect(liveRow(0)).toHaveCount(0);
    await expect.poll(liveRowCount, { timeout: 15_000 }).toBeLessThanOrEqual(2);
    await expect(
      endedGroup.locator('[data-feed-window-spacer="top"]')
    ).toHaveCount(1);

    // Scroll back — the live head rematerializes.
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(liveRow(0)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(liveRowCount, { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
  });

  test('drops catalog collapses far rows and rematerializes on scroll back', async ({
    page,
  }) => {
    await setE2eGraphDrops(page, 'window');
    await gotoApp(page, '/drops');
    await dismissNextDevOverlay(page);
    await expectDropsChrome(page);

    const list = page.locator('.market-listing-list').first();
    const row = (index: number) =>
      list.locator(`[data-catalog-key="e2e-win-drop-${index}"]`);
    const renderedRowCount = () => list.locator('[data-catalog-key]').count();

    await expect(row(0)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      0
    );

    // Deep scroll — the tail drop materializes, head rows collapse. Spacer
    // heights settle as measurements stream in, growing scrollHeight after
    // each pass, so keep scrolling until the tail row renders.
    const scroller = page.locator('.os-app-screen-body');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      if ((await row(ROW_COUNT - 1).count()) > 0) break;
      await page.waitForTimeout(300);
    }
    await expect(row(ROW_COUNT - 1)).toBeVisible({ timeout: 15_000 });
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect(row(0)).toHaveCount(0);

    // Scroll back — the head drop rematerializes.
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(row(0)).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(ROW_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
