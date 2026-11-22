import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, expectDropsChrome, gotoApp } from './helpers';
import { setE2eGraphDrops } from './helpers/e2e-graph';
import { E2E_MARKET_WINDOW_COUNT } from '../src/lib/e2e-graph-stubs';

/**
 * Drops catalog windowing — past the row threshold, far rows collapse into
 * spacer divs and rematerialize on scroll back.
 */

const ROW_COUNT = E2E_MARKET_WINDOW_COUNT;

test.describe('catalog windowing', () => {
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
