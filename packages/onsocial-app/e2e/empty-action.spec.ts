import { expect, test } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  expectOsEmptyAction,
  gotoApp,
} from './helpers';
import { stubCollectionPageGraph } from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';

test.describe('empty action', () => {
  test.describe.configure({ mode: 'serial' });

  test('Vault Browse Market uses the shared empty action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/collectibles');
    await expect(
      page.getByText('Connect to open Collectibles.', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectOsEmptyAction(
      page.getByRole('main').getByRole('link', { name: 'Browse Market' })
    );
  });

  test('Play Back to Collectibles uses the shared empty action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/collectibles/play');
    await expect(
      page.getByText('Couldn’t open this collectible.', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectOsEmptyAction(
      page.getByRole('link', { name: 'Back to Collectibles' })
    );
  });

  test('Unknown drop Back to Drops uses the shared empty action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setE2eGraphDrop(page, 'missing');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/no-such-drop');
    await expect(
      page.getByText('This drop isn’t available.', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expectOsEmptyAction(
      page.getByRole('link', { name: 'Back to Drops' })
    );
  });

  test('Drops Open Market uses the shared empty action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/drops');
    await expectOsEmptyAction(
      page.getByRole('main').getByRole('link', { name: 'Open Market' })
    );
  });
});
