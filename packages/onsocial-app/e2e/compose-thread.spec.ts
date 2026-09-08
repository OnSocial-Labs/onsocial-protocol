import { expect, test } from '@playwright/test';
import {
  clickAddThreadBeat,
  clearComposerThreadDrafts,
  composerBeatFields,
  E2E_THREAD_EXTRA,
  E2E_THREAD_ROOT,
  fillHomeThreadDraft,
  openHomePostComposer,
} from './helpers/compose-thread';
import {
  expectE2eSignerWrite,
  extractPreparedAction,
  seedE2eMockSigner,
  stubE2eComposePrepare,
} from './helpers/e2e-mock-signer';
import { dismissNextDevOverlay } from './helpers';

/**
 * Plus → two beats → Post. Mock signer records the root `set` and refuses
 * broadcast — extras never hit the chain. Real writes stay behind
 * `E2E_SIGNED_WRITES=1`.
 */
test.describe('compose thread', () => {
  test('plus two beats then Post records the root set', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await clearComposerThreadDrafts(page);
    await seedE2eMockSigner(page);
    await stubE2eComposePrepare(page);
    await openHomePostComposer(page);
    await dismissNextDevOverlay(page);
    await fillHomeThreadDraft(page);
    if (process.env.E2E_WALKTHROUGH_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/compose_thread_two_beats_ready.png`,
        fullPage: true,
      });
    }

    await dismissNextDevOverlay(page);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    await expectE2eSignerWrite(page, (recorded) => {
      const prepared = recorded.map(extractPreparedAction);
      expect(recorded.some((call) => call.methodName === 'execute')).toBe(true);
      expect(prepared.some((action) => action?.e2eVerb === 'set')).toBe(true);
      const blob = JSON.stringify(recorded);
      expect(blob).toContain(E2E_THREAD_ROOT);
      expect(blob).not.toContain(E2E_THREAD_EXTRA);
    });

    await expect(composerBeatFields(page)).toHaveCount(2);
    await expect(composerBeatFields(page).nth(1)).toHaveValue(E2E_THREAD_EXTRA);
  });

  test('plus stays disabled until the last beat has text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await clearComposerThreadDrafts(page);
    await seedE2eMockSigner(page);
    await openHomePostComposer(page);
    await dismissNextDevOverlay(page);

    await expect(
      page.getByRole('button', { name: 'Write this post first' })
    ).toBeDisabled();

    await page
      .getByRole('textbox', { name: 'Share something…' })
      .fill(E2E_THREAD_ROOT);
    await clickAddThreadBeat(page);
    await expect(composerBeatFields(page)).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Write this post first' })
    ).toBeDisabled();
  });
});
