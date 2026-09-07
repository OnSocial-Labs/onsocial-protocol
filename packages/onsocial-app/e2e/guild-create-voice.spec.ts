import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('create guild voice', () => {
  test('asks Connect from the dock, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/groups/create');

    await expect(
      page.getByRole('heading', { name: 'Create guild' })
    ).toBeVisible();
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Connect' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create guild' })).toBeDisabled();
    await expect(page.locator('.portfolio-summon-hint--connect')).toHaveText(
      'Connect'
    );
  });
});
