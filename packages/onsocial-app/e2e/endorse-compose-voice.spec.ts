import { expect, test } from '@playwright/test';
import {
  openEndorseComposeLoggedOut,
  stubEndorseComposeApis,
} from './helpers/endorse-compose-voice';

test.describe('endorse compose voice', () => {
  test('Endorse sheet asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubEndorseComposeApis(page);
    await openEndorseComposeLoggedOut(page);

    const sheet = page.getByRole('dialog').filter({ hasText: 'Endorse' });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    const person = sheet.locator('.gesture-sheet-person');
    await expect(person).toBeVisible();
    await expect(person).not.toHaveText('alice.testnet');
    await expect(sheet.getByText('@alice.testnet')).toBeVisible();
    await expect(
      sheet.getByText('Connect to put your name behind them.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
  });
});
