import { expect, test } from '@playwright/test';
import { ENDORSE_SUBMIT_CTA } from '../src/lib/endorse-compose-voice';
import {
  collectionPageRoot,
  expectCollectionPageSettled,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';
import {
  expectE2eSignerWrite,
  extractPreparedAction,
  seedE2eMockSigner,
  stubE2eComposePrepare,
  stubE2eDataGetOne,
} from './helpers/e2e-mock-signer';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './helpers';
import {
  expectSignedEndorseCompose,
  expectSignedVisitorGestures,
  openSignedEndorseCompose,
  openSignedVisitorProfile,
  signedChromeTargetAccount,
  signedChromeViewerAccount,
} from './helpers/signed-journey-chrome';

/**
 * Stand / Endorse / Mint submit without broadcasting.
 * App CI has no signer secrets — this is the default write coverage.
 * Real chain writes stay behind `E2E_SIGNED_WRITES=1`.
 */
test.describe('signed writes mock signer', () => {
  test('Stand records execute set for the target, then refuses broadcast', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, signedChromeViewerAccount());
    await stubE2eComposePrepare(page);
    await stubE2eDataGetOne(page);
    const { target } = await openSignedVisitorProfile(page);
    await expectSignedVisitorGestures(page, target);
    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: /^Stand with / }).click();

    const calls = await expectE2eSignerWrite(page, (recorded) => {
      const prepared = recorded.map(extractPreparedAction);
      expect(recorded.some((call) => call.methodName === 'execute')).toBe(true);
      expect(prepared.some((action) => action?.e2eVerb === 'set')).toBe(true);
      expect(JSON.stringify(recorded)).toContain(`standing/${target}`);
    });
    expect(JSON.stringify(calls)).not.toContain('purchase-from-collection');
  });

  test('Endorse submit records execute set for the endorsement path', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, signedChromeViewerAccount());
    await stubE2eComposePrepare(page);
    await stubE2eDataGetOne(page);
    await openSignedEndorseCompose(page);
    await expectSignedEndorseCompose(page);
    await dismissNextDevOverlay(page);

    const target = signedChromeTargetAccount();
    const sheet = page.getByRole('dialog', { name: /^Endorse / });
    const submit = sheet.getByRole('button', {
      name: ENDORSE_SUBMIT_CTA,
      exact: true,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expectE2eSignerWrite(page, (recorded) => {
      const prepared = recorded.map(extractPreparedAction);
      expect(recorded.some((call) => call.methodName === 'execute')).toBe(true);
      expect(prepared.some((action) => action?.e2eVerb === 'set')).toBe(true);
      expect(JSON.stringify(recorded)).toContain(`endorsement/${target}`);
    });
  });

  test('Mint records purchase-from-collection for night-drive', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, signedChromeViewerAccount());
    await stubE2eComposePrepare(page);
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
    const mintSubmit = sheet.getByRole('button', { name: /^Mint/ });
    await expect(mintSubmit).toBeVisible();
    await dismissNextDevOverlay(page);
    await mintSubmit.click();

    await expectE2eSignerWrite(page, (recorded) => {
      const prepared = recorded.map(extractPreparedAction);
      expect(recorded.some((call) => call.methodName === 'execute')).toBe(true);
      expect(
        prepared.some(
          (action) => action?.e2eVerb === 'purchase-from-collection'
        )
      ).toBe(true);
      expect(JSON.stringify(recorded)).toContain('night-drive');
    });
  });
});
