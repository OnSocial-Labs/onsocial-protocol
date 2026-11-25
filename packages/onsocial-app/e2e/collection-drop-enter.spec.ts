import { devices, expect, test, type Page } from '@playwright/test';
import { gotoApp } from './helpers';
import {
  collectionPageRoot,
  collectionPageSkeleton,
  seedE2eWallet,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';

/**
 * Phone drop entrance. Webkit project picks this up via @webkit;
 * Pixel 7 is the same device profile as feed scroll lock.
 */
const pixel = devices['Pixel 7'];

test.use({
  viewport: pixel.viewport,
  userAgent: pixel.userAgent,
  deviceScaleFactor: pixel.deviceScaleFactor,
  isMobile: pixel.isMobile,
  hasTouch: pixel.hasTouch,
});

const LIMIT_HINT = 'You’ve reached your limit for this drop.';

function viewBytes(value: unknown) {
  const json = JSON.stringify(value);
  return {
    jsonrpc: '2.0',
    id: 'onsocial-bff',
    result: {
      result: Array.from(json, (char) => char.charCodeAt(0)),
      logs: [],
    },
  };
}

/** Wallet mint allowance lands late. Other views resolve immediately. */
async function stubLateWalletMint(page: Page, delayMs = 1_400) {
  await page.route('**/api/near/rpc', async (route) => {
    const body = route.request().postDataJSON() as {
      method?: string;
      params?: { method_name?: string; request_type?: string };
    };
    const methodName = body?.params?.method_name;
    if (methodName === 'get_wallet_mint_remaining') {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.fulfill({ json: viewBytes(0) });
      return;
    }
    if (
      body?.method === 'query' &&
      body.params?.request_type === 'view_account'
    ) {
      await route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: 'onsocial-bff',
          result: { amount: '0', locked: '0', storage_usage: 0 },
        },
      });
      return;
    }
    await route.fulfill({ json: viewBytes(null) });
  });
}

test.describe('drop detail entrance @webkit', () => {
  test('cold load shows the skeleton, then content with the skeleton gone', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await stubCollectionPageGraph(page, { catalogDelayMs: 1_600 });
    await gotoApp(page, '/collection/quiet-print');

    const skeleton = collectionPageSkeleton(page);
    await expect(skeleton).toBeVisible({ timeout: 8_000 });
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Quiet Print', { timeout: 12_000 });
    await expect(skeleton).toHaveCount(0);
    await expect(page.locator('[data-drop-enter="stagger"]')).toHaveCount(4);
    await expect(page.locator('[data-drop-enter="instant"]')).toHaveCount(0);
  });

  test('a late wallet line does not move the block below', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await seedE2eWallet(page);
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await stubLateWalletMint(page);
    await gotoApp(page, '/collection/quiet-print');

    const reading = collectionPageRoot(page).locator('.collection-reading');
    await expect(reading).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(LIMIT_HINT)).toHaveCount(0);
    await page.evaluate((hint) => {
      const read = () => {
        const node = document.querySelector(
          '.collection-page:not(.collection-page--skeleton) .collection-reading'
        );
        if (!(node instanceof HTMLElement)) return null;
        const box = node.getBoundingClientRect();
        return { y: box.y, height: box.height };
      };
      const probe = {
        before: read(),
        after: null as { y: number; height: number } | null,
      };
      (
        window as unknown as {
          __hintShiftProbe?: typeof probe;
        }
      ).__hintShiftProbe = probe;
      const tick = () => {
        const box = read();
        const shown = document.body.innerText.includes(hint);
        if (!shown) {
          if (box) probe.before = box;
          requestAnimationFrame(tick);
          return;
        }
        if (!probe.after && box) probe.after = box;
      };
      requestAnimationFrame(tick);
    }, LIMIT_HINT);

    await expect(page.getByText(LIMIT_HINT)).toBeVisible({ timeout: 8_000 });
    const shift = await page.evaluate(() => {
      return (
        window as unknown as {
          __hintShiftProbe?: {
            before: { y: number; height: number } | null;
            after: { y: number; height: number } | null;
          };
        }
      ).__hintShiftProbe;
    });
    expect(shift?.before).not.toBeNull();
    expect(shift?.after).not.toBeNull();
    expect(
      Math.abs((shift?.before?.y ?? 0) - (shift?.after?.y ?? 0))
    ).toBeLessThan(1);
    expect(
      Math.abs((shift?.before?.height ?? 0) - (shift?.after?.height ?? 0))
    ).toBeLessThan(1);
  });

  test('reduced motion shows content immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubCollectionPageGraph(page, { catalogDelayMs: 900 });
    await gotoApp(page, '/collection/chapter-one');

    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Chapter One', { timeout: 12_000 });
    await expect(collectionPageSkeleton(page)).toHaveCount(0);
    await expect(page.locator('[data-drop-enter="stagger"]')).toHaveCount(0);
    const enter = page.locator('[data-drop-enter="instant"]').first();
    await expect(enter).toBeVisible();
    const motion = await enter.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        opacity: style.opacity,
        transform: style.transform,
        animationName: style.animationName,
      };
    });
    expect(motion.opacity).toBe('1');
    expect(motion.animationName).toBe('none');
    expect(
      motion.transform === 'none' ||
        motion.transform === 'matrix(1, 0, 0, 1, 0, 0)'
    ).toBe(true);
  });

  test('a seeded hot open shows no skeleton', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');

    await expect(collectionPageSkeleton(page)).toHaveCount(0);
    await expect(
      collectionPageRoot(page).locator('.collection-title')
    ).toHaveText('Night Drive');
    await expect(page.locator('[data-drop-enter="stagger"]')).toHaveCount(0);
    await expect(page.locator('[data-drop-enter="instant"]')).toHaveCount(4);
  });
});
