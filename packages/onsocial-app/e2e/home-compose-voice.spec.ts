import { expect, test } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

test.describe('home compose Connect voice', () => {
  test('guest composer asks Connect to post, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await expect(page.getByText('Connect to post.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Connect wallet')).toHaveCount(0);
    await expect(page.getByText('Connect your wallet')).toHaveCount(0);
  });
});
