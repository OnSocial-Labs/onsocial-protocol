import { expect, test, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './helpers';
import {
  expectCollectionPageSettled,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';

/**
 * Drawer smooth-scroll invariant. One AppSmoothScrollProvider binds the
 * Lenis wheel coast to every shared overflow root (`.os-app-screen-body`,
 * `.glass-sheet-body`, …), so any drawer built on the shared primitives
 * picks the coast up automatically — no per-sheet wiring. These two tests
 * lock that contract: a freshly opened GlassSheet drawer (the scarce Mint
 * sheet, via OsGestureSheet → GlassSheet) gets bound on desktop
 * fine-pointer, and stays on native scroll under reduced motion. If a
 * drawer ever drifts off the shared primitives — or the provider gates
 * regress — these fail instead of users noticing one dead drawer.
 */

async function openMintSheet(page: Page) {
  await setE2eGraphDrop(page, 'default');
  await stubCollectionPageGraph(page);
  await gotoApp(page, '/collection/night-drive');
  await dismissNextDevOverlay(page);
  await expectCollectionPageSettled(page);

  await page.getByRole('button', { name: 'Mint', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Mint' });
  await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  return sheet;
}

test.describe('drawer smooth scroll (Lenis)', () => {
  test('desktop fine-pointer: a freshly opened drawer body picks up the coast', async ({
    page,
  }) => {
    // The page screen body binds first — proof the provider is live.
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');
    await dismissNextDevOverlay(page);
    await expectCollectionPageSettled(page);
    await expect(page.locator('.os-app-screen-body').first()).toHaveClass(
      /\blenis\b/,
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );

    await page.getByRole('button', { name: 'Mint', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Mint' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    // Mounted after the provider started — the DOM observer must find it.
    // `lenis-smooth` is a transient class Lenis only carries while an
    // animated scroll is in flight, so the contract is: bound (`lenis`)
    // and running (not `lenis-stopped`).
    const body = sheet.locator('.glass-sheet-body');
    await expect(body).toHaveClass(/\blenis\b/);
    await expect(body).not.toHaveClass(/\blenis-stopped\b/);
  });

  test('reduced motion: the same drawer stays on native scroll', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sheet = await openMintSheet(page);

    const body = sheet.locator('.glass-sheet-body');
    await expect(body).toBeVisible();
    // Give a broken provider every chance to bind before asserting absence.
    await page.waitForTimeout(600);
    await expect(body).not.toHaveClass(/\blenis\b/);
    await expect(page.locator('.os-app-screen-body').first()).not.toHaveClass(
      /\blenis\b/
    );
  });
});
