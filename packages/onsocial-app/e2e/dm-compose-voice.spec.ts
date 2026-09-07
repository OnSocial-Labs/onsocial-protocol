import { expect, test } from '@playwright/test';
import { openDmComposeLoggedOut } from './helpers/dm-compose-voice';

test.describe('dm compose voice', () => {
  test('Message sheet asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDmComposeLoggedOut(page);

    const sheet = page.getByRole('dialog', { name: /^Message / });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    const person = sheet.locator('.gesture-sheet-person');
    await expect(person).toBeVisible();
    await expect(person).not.toHaveText('alice.testnet');
    await expect(sheet.getByText('@alice.testnet')).toBeVisible();
    await expect(
      sheet.getByText('Connect to message them.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
  });
});
