import { expect, test } from '@playwright/test';
import { openDmComposeLoggedOut } from './helpers/dm-compose-voice';

test.describe('dm compose voice', () => {
  test('Message sheet asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDmComposeLoggedOut(page);

    const sheet = page.getByRole('dialog', { name: /^Message / });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet.locator('.gesture-sheet-verb')).toHaveText('Message');
    await expect(sheet.locator('.gesture-sheet-person')).toHaveCount(0);
    await expect(sheet.locator('.gesture-sheet-handle')).toHaveCount(0);
    await expect(sheet.locator('.gesture-sheet-whisper')).toHaveCount(0);
    const face = sheet.locator('.scarce-buy-party');
    await expect(face).toBeVisible();
    await expect(face.locator('.scarce-buy-party-name')).not.toHaveText(
      'alice.testnet'
    );
    await expect(face.locator('.scarce-buy-party-handle')).toHaveText(
      '@alice.testnet'
    );
    await expect(
      sheet.getByText('Connect to message.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
    const attach = sheet.getByRole('button', { name: 'Attach photo or video' });
    await expect(attach).toBeVisible();
    await expect(attach).toHaveClass(/os-write-dock-tool/);
    await expect(attach).toHaveText('');
  });
});
