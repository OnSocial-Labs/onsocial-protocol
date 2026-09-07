import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('dock Connect voice', () => {
  test('dock account asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/discover');

    const dock = page.locator('.portfolio-summon-account.is-connect');
    await expect(dock).toBeVisible({ timeout: 15_000 });
    await expect(dock).toHaveAttribute('aria-label', 'Connect');
    await expect(
      page.getByRole('button', { name: 'Connect wallet' })
    ).toHaveCount(0);
  });
});
