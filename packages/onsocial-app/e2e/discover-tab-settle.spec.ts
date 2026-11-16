import { expect, test } from '@playwright/test';
import {
  clickTab,
  dismissNextDevOverlay,
  E2E_CHROME_TIMEOUT_MS,
  expectTabSelected,
  gotoApp,
} from './helpers';
import { stubDiscoverGuildsBrowse } from './helpers/discover-guilds';

/**
 * Guild topic filter lives in the guilds panel. Leaving Moving and coming
 * back must keep that choice, and must not cover the page with the route
 * skeleton.
 */
test.describe('discover tab settle', () => {
  test('keeps the guild topic filter across a Moving round-trip', async ({
    page,
  }) => {
    await stubDiscoverGuildsBrowse(page, { failMoreOnce: false });
    await gotoApp(page, '/discover');
    await dismissNextDevOverlay(page);

    await clickTab(page, 'Discover', 'Guilds');
    const topics = page.getByRole('tablist', { name: 'Browse guilds by topic' });
    const builders = topics.getByRole('tab', { name: 'Builders', exact: true });
    await expect(builders).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await builders.click();
    await expectTabSelected(page, 'Browse guilds by topic', 'Builders');

    await page.evaluate(() => {
      const record = window as Window & { __settleCovers?: number };
      record.__settleCovers = 0;
      const observer = new MutationObserver(() => {
        if (document.querySelector('.os-route-skeleton')) {
          record.__settleCovers = (record.__settleCovers ?? 0) + 1;
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    });

    await clickTab(page, 'Discover', 'Moving');
    // Hot posts is omitted when the board is empty ("Nothing moving yet.").
    // The Moving tabpanel is the surface that is always there.
    await expect(page.getByRole('tabpanel', { name: 'Moving' })).toBeVisible({
      timeout: E2E_CHROME_TIMEOUT_MS,
    });
    await clickTab(page, 'Discover', 'Guilds');
    await expectTabSelected(page, 'Browse guilds by topic', 'Builders');

    const covers = await page.evaluate(
      () =>
        (window as Window & { __settleCovers?: number }).__settleCovers ?? 0
    );
    expect(covers).toBe(0);
    await expect(page.locator('.os-route-skeleton')).toHaveCount(0);
  });
});
