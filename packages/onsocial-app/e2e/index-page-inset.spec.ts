import { expect, test } from '@playwright/test';
import {
  expectChromePageInset,
  expectDropsChrome,
  expectMarketChrome,
  gotoApp,
} from './helpers';

test.describe('index page inset', () => {
  test.describe.configure({ mode: 'serial' });

  test('Guilds uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups');
    await expect(page.getByRole('heading', { name: 'Guilds' })).toBeVisible();
    await expectChromePageInset(page.locator('.launcher-home'));
  });

  test('Hubs uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps');
    await expect(page.getByRole('heading', { name: 'Hubs' })).toBeVisible();
    await expectChromePageInset(page.locator('.launcher-home'));
  });

  test('DAOs uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos');
    await expect(page.getByRole('heading', { name: 'DAOs' })).toBeVisible();
    await expectChromePageInset(page.locator('.launcher-home'));
  });

  test('Drops uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/drops');
    await expectDropsChrome(page);
    await expectChromePageInset(page.locator('.drops-page-body'));
  });

  test('Market uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/market');
    await expectMarketChrome(page);
    await expectChromePageInset(page.locator('.market-page[data-market-panel]'));
  });
});
