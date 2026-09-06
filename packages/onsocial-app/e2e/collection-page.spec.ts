import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';
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
});
