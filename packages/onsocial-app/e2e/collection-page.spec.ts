import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';
import {
  COLLECTION_E2E_VIEWER,
  expectCollectionHolderChrome,
  expectCollectionVisitorChrome,
  seedE2eWallet,
  stubCollectionPageGraph,
} from './helpers/collection-page';

const HOLDER_BACK = `/@${COLLECTION_E2E_VIEWER}/collectibles`;
const PILL_ACTION = /page-drawer-section-action/;

test.describe('collection drop page', () => {
  test('SSR catalog miss keeps the skeleton until the client fetch settles', async ({
    page,
  }) => {
    await stubCollectionPageGraph(page, { catalogDelayMs: 2500 });
    await gotoApp(page, '/collection/night-drive');
    await expect(page.locator('[data-collection-page-skeleton]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("This drop isn’t available.")).toHaveCount(0);
    await expect(page.locator('.collection-title')).toHaveText('Night Drive', {
      timeout: 12_000,
    });
    await expect(page.locator('[data-collection-page-skeleton]')).toHaveCount(0);
  });

  test('unknown drop shows unavailable after the client fetch settles', async ({
    page,
  }) => {
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/no-such-drop');
    await expect(page.getByText("This drop isn’t available.")).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.locator('[data-collection-page-skeleton]')).toHaveCount(0);
  });

  test('visitor audio drop keeps commerce first', async ({ page }) => {
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');

    await expect(page.locator('.collection-title')).toHaveText('Night Drive', {
      timeout: 30_000,
    });
    await expectCollectionVisitorChrome(page);
    await expect(page.getByRole('link', { name: 'Play' })).toHaveCount(0);
    await expect(page.locator('.collection-tracks')).toBeVisible();
    await expect(page.getByText('2 tracks').first()).toBeVisible();
    await expect(page.locator('.collection-meta-creator-name')).toHaveText(
      'by Alice'
    );
    await expect(page.locator('.collection-meta-handle')).toHaveText(
      '@alice.near'
    );
  });

  test('visitor writing drop keeps Read locked under commerce', async ({
    page,
  }) => {
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/chapter-one');

    await expect(page.locator('.collection-title')).toHaveText('Chapter One', {
      timeout: 30_000,
    });
    await expectCollectionVisitorChrome(page);
    await expect(page.locator('.collection-reading')).toBeVisible();
    const read = page.getByRole('button', { name: 'Read', exact: true });
    await expect(read).toBeVisible();
    await expect(read).toHaveClass(/collection-reading-open/);
    await expect(read).not.toHaveClass(PILL_ACTION);
    await expect(
      page.getByText('Connect your wallet and Collect an edition to read.')
    ).toBeVisible();
  });

  test('held audio drop puts Play above the product row', async ({ page }) => {
    await seedE2eWallet(page);
    await stubCollectionPageGraph(page, {
      heldIds: ['night-drive'],
      endedIds: ['night-drive'],
    });
    await gotoApp(page, '/collection/night-drive');

    await expect(page.locator('.collection-title')).toHaveText('Night Drive', {
      timeout: 30_000,
    });
    await expectCollectionHolderChrome(page, HOLDER_BACK);
    const play = page.locator('.collection-use-actions').getByRole('link', {
      name: 'Play',
    });
    await expect(play).toHaveClass(PILL_ACTION);
    await expect(play).toHaveAttribute(
      'href',
      /\/collectibles\/play\?.*night-drive/
    );
    await expect(page.locator('.collection-tracks')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Open Collectibles' })
    ).toHaveAttribute('href', HOLDER_BACK);
  });

  test('held writing drop puts Read in a vault pill', async ({ page }) => {
    await seedE2eWallet(page);
    await stubCollectionPageGraph(page, {
      heldIds: ['chapter-one'],
      endedIds: ['chapter-one'],
    });
    await gotoApp(page, '/collection/chapter-one');

    await expect(page.locator('.collection-title')).toHaveText('Chapter One', {
      timeout: 30_000,
    });
    await expectCollectionHolderChrome(page, HOLDER_BACK);
    const read = page.getByRole('button', { name: 'Read', exact: true });
    await expect(read).toHaveClass(PILL_ACTION);
    await expect(page.locator('.collection-writing-locked')).toHaveCount(0);
  });

  test('held art drop still opens Collectibles without a use pill', async ({
    page,
  }) => {
    await seedE2eWallet(page);
    await stubCollectionPageGraph(page, { heldIds: ['quiet-print'] });
    await gotoApp(page, '/collection/quiet-print');

    await expect(page.locator('.collection-title')).toHaveText('Quiet Print', {
      timeout: 30_000,
    });
    await expectCollectionHolderChrome(page, HOLDER_BACK);
    await expect(page.getByRole('link', { name: 'Play' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Read' })).toHaveCount(0);
  });

  test('Collect sheet speaks one deal, not a mint form', async ({ page }) => {
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');
    await expect(page.locator('.collection-title')).toHaveText('Night Drive', {
      timeout: 30_000,
    });

    await page.getByRole('button', { name: 'Mint', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Mint' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(sheet.getByText('Night Drive', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Alice', { exact: true })).toBeVisible();
    await expect(sheet.getByText('@alice.near')).toBeVisible();
    await expect(sheet.getByText('8 of 10 left')).toBeVisible();
    await expect(sheet.getByText('2 NEAR', { exact: true })).toHaveCount(1);
    await expect(sheet.getByText('Ask ·', { exact: false })).toHaveCount(0);
    await expect(sheet.getByText('Primary mint', { exact: true })).toHaveCount(
      0
    );
    await expect(sheet.getByText('Connect to mint this scarce.')).toHaveCount(
      0
    );
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
  });
});
