import { expect, test } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  expectChromePageInset,
  gotoApp,
} from './helpers';

test.describe('create page inset', () => {
  test.describe.configure({ mode: 'serial' });

  test('Create DAO uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos/create');
    await expect(page.getByRole('heading', { name: 'Create DAO' })).toBeVisible();
    await expectChromePageInset(page.locator('.dao-create-form'));
  });

  test('Create guild uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');
    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    await expectChromePageInset(page.locator('.guild-create-form'));
  });

  test('Open a hub uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/apps/create');
    await expect(page.getByRole('heading', { name: 'Open a hub' })).toBeVisible();
    await expectChromePageInset(page.locator('.hub-create-form'));
  });

  test('New drop uses the shared chrome page inset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/drops/create');
    await expect(page.locator('.drop-create-form')).toHaveAttribute(
      'data-drop-create-ready',
      '',
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );
    await expectChromePageInset(page.locator('.drop-create-form'));
  });
});
