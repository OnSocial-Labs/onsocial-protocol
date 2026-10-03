import { expect, test, type Locator } from '@playwright/test';
import {
  ENDORSE_E2E_ACCOUNT,
  openEndorseComposeLoggedOut,
  openEndorsementsPanelLoggedOut,
  stubEndorseComposeApis,
} from './helpers/endorse-compose-voice';

function borderTop(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).borderTopWidth);
}

test.describe('endorse compose voice', () => {
  test('Endorse sheet asks Connect, not Connect wallet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubEndorseComposeApis(page);
    await openEndorseComposeLoggedOut(page);

    const sheet = page.getByRole('dialog', { name: /^Endorse / });
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
    const attach = sheet.getByRole('button', { name: 'Attach photo or video' });
    await expect(attach).toBeVisible();
    await expect(attach).toHaveClass(/os-write-dock-tool/);
    await expect(attach).toHaveText('');

    const design = sheet.getByRole('button', { name: 'Design', exact: true });
    await expect(design).toHaveClass(/os-surface-chip/);
    await expect(design).not.toHaveClass(/endorse-compose-chip/);
    expect(await borderTop(design)).toBe('0px');
  });

  test('Received and Given use the shared borderless list track', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubEndorseComposeApis(page);
    await page.route('**/api/profile/endorsements**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accountId: ENDORSE_E2E_ACCOUNT,
          counts: { received: 1, given: 0 },
          received: [
            {
              issuer: 'bob.testnet',
              target: ENDORSE_E2E_ACCOUNT,
              topic: 'design',
              note: 'Clear product work.',
              v: 1,
              since: 1,
              blockHeight: 1,
              blockTimestamp: 1_700_000_000_000_000_000,
              issuerName: 'Bob',
              issuerAvatarUrl: null,
              targetName: null,
              targetAvatarUrl: null,
              mediaUrl: null,
              supporterCount: 0,
            },
          ],
          given: [],
          receivedHasMore: false,
          givenHasMore: false,
        }),
      });
    });
    const panel = await openEndorsementsPanelLoggedOut(page);

    const track = panel.locator('.app-storage-mode-toggle');
    await expect(track).toBeVisible();
    await expect(panel.locator('.endorsements-mode-chip')).toHaveCount(0);
    expect(await borderTop(track)).toBe('0px');

    const received = panel.getByRole('tab', { name: /Received/ });
    const given = panel.getByRole('tab', { name: /Given/ });
    await expect(received).toHaveClass(/app-storage-mode/);
    await expect(received).toHaveClass(/is-active/);
    await expect(given).toHaveClass(/app-storage-mode/);
    await expect(given).not.toHaveClass(/is-active/);
    expect(await borderTop(received)).toBe('0px');
    expect(await borderTop(given)).toBe('0px');

    const support = panel.getByRole('button', { name: 'Support', exact: true });
    await expect(support).toBeVisible();
    expect(await borderTop(support)).toBe('0px');
  });
});
