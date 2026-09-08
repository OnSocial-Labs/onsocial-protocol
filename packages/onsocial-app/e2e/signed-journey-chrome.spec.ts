import { expect, test } from '@playwright/test';
import {
  collectionPageRoot,
  expectCollectionPageSettled,
  seedE2eWallet,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';
import { E2E_CHROME_TIMEOUT_MS, expectTabSelected, gotoApp } from './helpers';
import {
  expectSignedEndorseCompose,
  expectSignedVisitorGestures,
  openSignedEndorseCompose,
  openSignedVisitorProfile,
  signedChromeViewerAccount,
} from './helpers/signed-journey-chrome';

/**
 * Painted-wallet chrome for stand / endorse / mint.
 * Does not submit a chain write — App CI has no signer secrets.
 * Real signed journeys call `skipUnlessE2eSigner` and stay opt-in.
 */
test.describe('signed journey chrome', () => {
  test('profile gestures speak Stand and Endorse, not Connect', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSignedVisitorProfile(page);
    await expectSignedVisitorGestures(page);
  });

  test('Endorse sheet asks Endorse, not Connect', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSignedEndorseCompose(page);
    await expectSignedEndorseCompose(page);
  });

  test('Discover Profiles drops the Connect stand hint', async ({ page }) => {
    await seedE2eWallet(page, signedChromeViewerAccount());
    await gotoApp(page, '/discover?tab=profiles');
    await expectTabSelected(page, 'Discover', 'Profiles');
    await expect(page.locator('.portfolio-summon-account.is-you')).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await expect(
      page.getByText('Connect to stand with profiles.')
    ).toHaveCount(0);
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page.locator('.portfolio-summon-account.is-connect')
    ).toHaveCount(0);
  });

  test('Collect sheet asks Mint, not Connect', async ({ page }) => {
    await seedE2eWallet(page, signedChromeViewerAccount());
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
    await expect(sheet.getByText('8 of 10 left')).toBeVisible();
    await expect(sheet.getByText('Connect to mint this scarce.')).toHaveCount(
      0
    );
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: /^Mint/ })).toBeVisible();
  });
});
