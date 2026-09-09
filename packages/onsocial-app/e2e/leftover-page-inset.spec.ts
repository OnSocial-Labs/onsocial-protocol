import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, expectChromePageInset, gotoApp } from './helpers';
import { stubCollectionPageGraph } from './helpers/collection-page';
import { setE2eGraphCatalog, setE2eGraphDrop } from './helpers/e2e-graph';
import {
  expectSeriesPageSettled,
  seriesPageRoot,
  stubSeriesCreatorCatalog,
} from './helpers/series-page';

const SERIES_PATH = `/series/${encodeURIComponent('e2e.series.testnet')}/${encodeURIComponent('audit-series')}`;

test.describe('leftover page inset', () => {
  test.describe.configure({ mode: 'serial' });

  test('Vault uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/collectibles');
    await expect(
      page.getByText('Connect to open Collectibles.', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectChromePageInset(page.locator('.collectibles-page'));
  });

  test('Series uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphCatalog(page, 'empty');
    await stubSeriesCreatorCatalog(page, { rows: 'empty' });
    await gotoApp(page, SERIES_PATH);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Audit Series' })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectSeriesPageSettled(page);
    await expectChromePageInset(seriesPageRoot(page));
  });

  test('Admit door uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/gate-pass/door');
    await expect(
      page.getByText('Connect to admit guests.', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectChromePageInset(page.locator('.ticket-door-page'));
  });

  test('Play uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/collectibles/play');
    await expect(
      page.getByText('Couldn’t open this collectible.', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectChromePageInset(page.locator('.collectibles-play-page'));
  });

  test('Unknown drop shell uses the shared chrome page inset', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphDrop(page, 'missing');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/no-such-drop');
    await expect(
      page.getByText('This drop isn’t available.')
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectChromePageInset(page.locator('.market-page'));
  });
});
