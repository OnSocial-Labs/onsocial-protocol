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
 * Plus → two beats → Post. Mock signer records one batched `set` (root +
 * extra) and refuses broadcast. Real writes stay behind
 * `E2E_SIGNED_WRITES=1`.
 */
test.describe('compose thread', () => {
  test('plus two beats then Post records one batched set', async ({ page }) => {
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
      expect(blob).toContain(E2E_THREAD_EXTRA);
    });

    await expect(composerBeatFields(page)).toHaveCount(2);
    await expect(composerBeatFields(page).nth(1)).toHaveValue(E2E_THREAD_EXTRA);
  });

  test('header switches between Post and Article', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await clearComposerThreadDrafts(page);
    await seedE2eMockSigner(page);
    await openHomePostComposer(page);
    await dismissNextDevOverlay(page);

    const postDialog = page.getByRole('dialog', { name: 'New post' });
    const mode = postDialog.getByRole('listbox', { name: 'Post or article' });
    await expect(mode.getByRole('option', { name: 'Post' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(
      postDialog.getByRole('button', { name: 'Write an article' })
    ).toHaveCount(0);
    await expect(
      postDialog.getByRole('button', { name: 'Switch to a regular post' })
    ).toHaveCount(0);
    await expect(
      postDialog.getByRole('button', { name: 'Add content warning' })
    ).toBeVisible();

    if (process.env.E2E_WALKTHROUGH_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/compose-post-chip.png`,
      });
    }

    await mode.getByRole('option', { name: 'Article' }).click();
    const articleDialog = page.getByRole('dialog', { name: 'New article' });
    await expect(
      articleDialog.getByRole('textbox', { name: 'Article title' })
    ).toBeVisible();
    await expect(
      articleDialog.getByRole('option', { name: 'Article' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      articleDialog.getByRole('button', { name: 'Add cover photo' })
    ).toBeVisible();
    await expect(
      articleDialog.getByRole('button', { name: 'Add poll' })
    ).toHaveCount(0);
    await expect(
      articleDialog.getByRole('button', { name: 'Write an article' })
    ).toHaveCount(0);
    await expect(
      articleDialog.getByRole('button', { name: 'Publish', exact: true })
    ).toBeDisabled();

    if (process.env.E2E_WALKTHROUGH_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_WALKTHROUGH_DIR}/compose-article-chip.png`,
      });
    }

    await articleDialog
      .getByRole('textbox', { name: 'Article title' })
      .fill('Night drive');
    await articleDialog.getByRole('option', { name: 'Post' }).click();
    const confirm = page.getByRole('dialog', { name: 'Switch to Post?' });
    await expect(confirm.getByText('The title will be cleared.')).toBeVisible();
    await confirm.getByRole('button', { name: 'Switch', exact: true }).click();
    const restored = page.getByRole('dialog', { name: 'New post' });
    await expect(restored).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Article title' })
    ).toHaveCount(0);
    await expect(
      restored.getByRole('option', { name: 'Post' })
    ).toHaveAttribute('aria-selected', 'true');
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
