import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';
import {
  AMPLIFY_E2E_AUTHOR,
  AMPLIFY_E2E_POST_ID,
  stubAmplifyPostGraph,
} from './helpers/amplify-voice';

test.describe('amplify voice', () => {
  test('Amplify sheet asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAmplifyPostGraph(page);
    await gotoApp(
      page,
      `/@${AMPLIFY_E2E_AUTHOR}/posts/${AMPLIFY_E2E_POST_ID}`
    );

    await page.getByRole('button', { name: 'Amplify this post' }).click();

    const sheet = page.getByRole('dialog').filter({ hasText: 'Amplify' });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(
      sheet.getByText('Connect to amplify with SOCIAL.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
  });
});
