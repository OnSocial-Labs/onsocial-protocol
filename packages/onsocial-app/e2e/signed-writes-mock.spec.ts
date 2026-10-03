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
  softOpenPortfolioOverlay,
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

  test('a topic chip dirties the sheet and close asks to discard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, signedChromeViewerAccount());
    await stubE2eComposePrepare(page);
    await stubE2eDataGetOne(page);
    await openSignedEndorseCompose(page);
    await expectSignedEndorseCompose(page);
    await dismissNextDevOverlay(page);

    const sheet = page.getByRole('dialog', { name: /^Endorse / });
    await sheet.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(sheet.locator('.endorse-compose-input')).toHaveValue('Design');
    await sheet.getByRole('button', { name: 'Close endorse' }).click();

    const discard = page.getByRole('dialog', { name: 'Discard endorsement?' });
    await expect(discard).toBeVisible();
    await discard
      .locator('button.os-sheet-action')
      .filter({ hasText: 'Keep editing' })
      .click();
    await expect(discard).toBeHidden();
    await expect(sheet.locator('.endorse-compose-input')).toHaveValue('Design');
  });

  test('remove asks, then records a null endorsement set', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const viewer = signedChromeViewerAccount();
    const target = signedChromeTargetAccount();
    await seedE2eMockSigner(page, viewer);
    await stubE2eComposePrepare(page);
    await stubE2eDataGetOne(page);
    await openSignedVisitorProfile(page);
    await page.route('**/api/profile/endorsements**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: target,
          counts: { received: 1, given: 0 },
          received: [
            {
              issuer: viewer,
              target,
              v: 1,
              since: 1,
              blockHeight: 1,
              blockTimestamp: 1_700_000_000_000_000_000,
              issuerName: 'Green',
              issuerAvatarUrl: null,
              targetName: null,
              targetAvatarUrl: null,
              mediaUrl: null,
              supporterCount: 0,
            },
          ],
          given: [],
          receivedHasMore: false,
          givenHasMore: false,
        }),
      });
    });
    await dismissNextDevOverlay(page);
    await softOpenPortfolioOverlay(page, `/@${target}/endorsements`);

    const panel = page.locator('.endorsements-panel');
    await expect(panel).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await panel.getByRole('button', { name: 'Edit', exact: true }).click();

    const sheet = page.getByRole('dialog', { name: /^Edit endorsement/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Remove endorsement' }).click();
    const confirm = page.getByRole('dialog', {
      name: 'Remove this endorsement?',
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Remove', exact: true }).click();

    await expectE2eSignerWrite(page, (recorded) => {
      const prepared = recorded.map(extractPreparedAction);
      expect(
        prepared.some((action) => {
          const body = action?.body as
            | { path?: string; value?: unknown }
            | undefined;
          return (
            action?.e2eVerb === 'set' &&
            body?.path === `endorsement/${target}` &&
            body.value === null
          );
        })
      ).toBe(true);
    });
  });

  test('a successful endorse closes the sheet and the face reads Endorsed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedE2eMockSigner(page, signedChromeViewerAccount(), {
      succeed: true,
    });
    await stubE2eComposePrepare(page);
    await stubE2eDataGetOne(page);
    await openSignedEndorseCompose(page);
    await expectSignedEndorseCompose(page);
    await dismissNextDevOverlay(page);

    const sheet = page.getByRole('dialog', { name: /^Endorse / });
    await sheet
      .getByRole('button', { name: ENDORSE_SUBMIT_CTA, exact: true })
      .click();

    await expect(sheet).toBeHidden({ timeout: E2E_CHROME_TIMEOUT_MS });
    const face = page.locator('.portfolio-identity-gesture--endorse');
    await expect(face).toContainText('Endorsed');
    await expect(
      page.getByRole('button', { name: /^Edit endorsement for / })
    ).toBeVisible();
  });
});
