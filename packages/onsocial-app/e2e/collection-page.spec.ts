import { expect, test } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, expectConnectVoice, expectOsRowAction, gotoApp } from './helpers';
import {
  COLLECTION_E2E_VIEWER,
  collectionPageRoot,
  expectCollectionHolderChrome,
  expectCollectionPageSettled,
  expectCollectionVisitorChrome,
  seedE2eWallet,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';

const HOLDER_BACK = `/@${COLLECTION_E2E_VIEWER}/collectibles`;

test.describe('collection drop page', () => {
  test('SSR catalog miss keeps the skeleton until the client fetch settles', async ({
    page,
  }) => {
    await stubCollectionPageGraph(page, { catalogDelayMs: 2500 });
    await gotoApp(page, '/collection/night-drive');
    await expect(page.locator('[data-collection-page-skeleton]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText('This drop isn’t available.')).toHaveCount(0);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Night Drive', {
      timeout: 12_000,
    });
    await expect(page.locator('[data-collection-page-skeleton]')).toHaveCount(
      0
    );
  });

  test('SSR catalog hit paints Night Drive without the skeleton', async ({
    page,
  }) => {
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');
    await expectCollectionPageSettled(page);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Night Drive');
    await expect(page.getByText('2 tracks').first()).toBeVisible();
  });

  test('unknown drop shows unavailable after the client fetch settles', async ({
    page,
  }) => {
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/no-such-drop');
    await expect(page.getByText('This drop isn’t available.')).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.locator('[data-collection-page-skeleton]')).toHaveCount(
      0
    );
  });

  test('visitor audio drop keeps commerce first', async ({ page }) => {
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');

    await expectCollectionPageSettled(page);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Night Drive');
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

  test.describe('visitor writing at 390', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('visitor writing drop keeps Read locked under commerce', async ({
      page,
    }) => {
      await setE2eGraphDrop(page, 'default');
      await stubCollectionPageGraph(page);
      await gotoApp(page, '/collection/chapter-one');

      await expectCollectionPageSettled(page);
      await expect(
        collectionPageRoot(page).locator('.collection-title')
      ).toHaveText('Chapter One');
      await expectCollectionVisitorChrome(page);
      await expect(page.locator('.collection-reading')).toBeVisible();
      const read = page.getByRole('button', { name: 'Read', exact: true });
      await expect(read).toBeVisible();
      await expectOsRowAction(read);
      await expect(
        page.getByText('Connect to read.', { exact: true })
      ).toBeVisible();
      await read.click();
      const sheet = page.locator('.scarce-read-slide');
      const footerConnect = sheet
        .locator('.os-sheet-footer')
        .getByRole('button', { name: 'Connect', exact: true });
      await expect(footerConnect).toBeVisible({
        timeout: E2E_CHROME_TIMEOUT_MS,
      });
      await expect(page.getByText('Connect wallet')).toHaveCount(0);
      await expect(page.getByText('Manuscript')).toHaveCount(0);
      const insets = await sheet.evaluate((root) => {
        const title = root.querySelector('.scarce-writing-read-title');
        const button = root.querySelector('.os-sheet-footer button');
        const readCol = root.querySelector('.scarce-writing-read');
        const footer = root.querySelector('.os-sheet-footer');
        if (!title || !button || !readCol || !footer) return null;
        return {
          viewport: window.innerWidth,
          titleX: title.getBoundingClientRect().x,
          buttonX: button.getBoundingClientRect().x,
          readPad: Number.parseFloat(getComputedStyle(readCol).paddingLeft),
          footerPad: Number.parseFloat(getComputedStyle(footer).paddingLeft),
        };
      });
      expect(insets).toBeTruthy();
      expect(insets?.viewport).toBe(390);
      expect(
        Math.abs((insets?.titleX ?? 0) - (insets?.buttonX ?? 0))
      ).toBeLessThan(2);
      expect(insets?.readPad).toBeCloseTo(18.4, 0);
      expect(insets?.footerPad).toBeCloseTo(18.4, 0);
    });
  });

  test('held audio drop puts Play above the product row', async ({ page }) => {
    await seedE2eWallet(page);
    await setE2eGraphDrop(page, 'held');
    await stubCollectionPageGraph(page, {
      heldIds: ['night-drive'],
      endedIds: ['night-drive'],
    });
    await gotoApp(page, '/collection/night-drive');

    await expectCollectionPageSettled(page);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Night Drive');
    await expectCollectionHolderChrome(page, HOLDER_BACK);
    const play = collectionPageRoot(page)
      .locator('.collection-use-actions')
      .getByRole('link', {
      name: 'Play',
    });
    await expectOsRowAction(play);
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
    await setE2eGraphDrop(page, 'held');
    await stubCollectionPageGraph(page, {
      heldIds: ['chapter-one'],
      endedIds: ['chapter-one'],
    });
    await gotoApp(page, '/collection/chapter-one');

    await expectCollectionPageSettled(page);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Chapter One');
    await expectCollectionHolderChrome(page, HOLDER_BACK);
    const read = page.getByRole('button', { name: 'Read', exact: true });
    await expectOsRowAction(read);
    await expect(page.locator('.collection-writing-locked')).toHaveCount(0);
  });

  test('held art drop still opens Collectibles without a use pill', async ({
    page,
  }) => {
    await seedE2eWallet(page);
    await setE2eGraphDrop(page, 'held');
    await stubCollectionPageGraph(page, { heldIds: ['quiet-print'] });
    await gotoApp(page, '/collection/quiet-print');

    await expectCollectionPageSettled(page);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Quiet Print');
    await expectCollectionHolderChrome(page, HOLDER_BACK);
    await expect(page.getByRole('link', { name: 'Play' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Read' })).toHaveCount(0);
  });

  test('Collect sheet speaks one deal, not a mint form', async ({ page }) => {
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');
    await expectCollectionPageSettled(page);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Night Drive');

    await page.getByRole('button', { name: 'Mint', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Mint' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(sheet.getByText('Night Drive', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Author', { exact: true })).toHaveCount(0);
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

  test('Admit door asks Connect, not Connect wallet', async ({ page }) => {
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/gate-pass/door');

    await expect(
      page.getByText('Connect to admit guests.', { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page.locator('.os-app-screen[data-header-owns-connect]')
    ).toHaveCount(0);
    await expect(page.locator('.ticket-door-page-actions')).toHaveCount(0);
    await expectConnectVoice(page);
    await expect(page.locator('.portfolio-summon-hint--connect')).toHaveText(
      'Connect'
    );
  });
});
