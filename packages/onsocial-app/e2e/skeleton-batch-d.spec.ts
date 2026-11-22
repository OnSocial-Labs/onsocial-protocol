import { expect, test, type Page, type Route } from '@playwright/test';
import { gotoApp } from './helpers';
import {
  setE2eGraphDrop,
  setE2eGraphDrops,
  setE2eGraphMarket,
  setE2eGraphProfile,
} from './helpers/e2e-graph';
import { e2ePortfolioAccountId } from './helpers/e2e-signers';

const ARTIFACTS = '/opt/cursor/artifacts';

async function holdJsChunks(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  await page.route('**/_next/static/**/*.js', async (route) => {
    held.push(route);
  });
  return async () => {
    await page.unroute('**/_next/static/**/*.js').catch(() => {});
    await Promise.all(
      held.splice(0).map((route) => route.continue().catch(() => {}))
    );
  };
}

test.describe('skeleton batch D', () => {
  test('drops cold skeleton omits the market footer before hydration', async ({
    page,
  }) => {
    const release = await holdJsChunks(page);
    await page.goto('/drops', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.market-listing-list--skeleton')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Looking for secondary listings?')).toHaveCount(
      0
    );
    await expect(page.getByRole('link', { name: 'Open Market' })).toHaveCount(
      0
    );
    expect(
      await page.evaluate(() => document.body.dataset.appHydrated ?? '')
    ).not.toBe('true');
    await release();
  });

  for (const width of [390, 1280] as const) {
    test(`after shots at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      const shot = async (name: string) => {
        await page.screenshot({
          path: `${ARTIFACTS}/skeleton-d-${name}-${width}.png`,
        });
      };

      await setE2eGraphDrop(page, 'default');
      await gotoApp(page, '/collection/night-drive');
      await expect(page.locator('.collection-title')).toHaveText(
        'Night Drive',
        {
          timeout: 20_000,
        }
      );
      await expect(page.locator('.collection-tracks')).toBeVisible();
      await shot('collection-audio');

      await gotoApp(page, '/collection/quiet-print');
      await expect(page.locator('.collection-title')).toHaveText(
        'Quiet Print',
        {
          timeout: 20_000,
        }
      );
      await expect(page.locator('.collection-cover.is-square')).toBeVisible();
      await expect(page.locator('.collection-cover.is-immersive')).toHaveCount(
        0
      );
      await shot('collection-art');

      await setE2eGraphDrops(page, 'covers');
      await gotoApp(page, '/drops');
      await expect(page.locator('.drops-discovery-row').first()).toBeVisible({
        timeout: 20_000,
      });
      await shot('drops');

      await setE2eGraphDrops(page, 'events');
      await gotoApp(page, '/events');
      await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible(
        {
          timeout: 20_000,
        }
      );
      await shot('events');

      await setE2eGraphMarket(page, 'live-first');
      await gotoApp(page, '/market');
      await expect(page.locator('.market-listing-row').first()).toBeVisible({
        timeout: 20_000,
      });
      await shot('market');

      await setE2eGraphProfile(page, 'banner');
      const accountId = e2ePortfolioAccountId();
      await gotoApp(page, `/@${accountId}?tab=replies`);
      const replies = page.locator('#profile-feed-tab-replies');
      await expect(replies).toBeVisible({ timeout: 20_000 });
      await replies.click();
      await expect(page.locator('.post-row-skeleton-list')).toHaveCount(0, {
        timeout: 20_000,
      });
      await shot('drawer-replies');
      await page.locator('#profile-feed-tab-reposts').click();
      await expect(page.locator('.post-row-skeleton-list')).toHaveCount(0, {
        timeout: 20_000,
      });
      await shot('drawer-reposts');

      await gotoApp(page, '/discover?tab=profiles');
      await expect(page.getByRole('tab', { name: 'Profiles' })).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.locator('.standing-row, .standing-panel-empty-primary').first()
      ).toBeVisible({ timeout: 20_000 });
      await shot('discover');
    });
  }
});
