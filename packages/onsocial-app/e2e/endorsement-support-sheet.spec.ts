import { expect, test } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import {
  ENDORSE_E2E_ACCOUNT,
  openEndorsementsPanelLoggedOut,
} from './helpers/endorse-compose-voice';
import { dismissNextDevOverlay } from './helpers/navigation';
import { SIGNED_CHROME_VIEWER } from './helpers/signed-journey-chrome';

test('endorsement support header is the verb and the person is the body face', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
            targetName: 'Alice',
            supporterCount: 0,
          },
        ],
        given: [],
        receivedHasMore: false,
        givenHasMore: false,
      }),
    });
  });

  await seedE2eWallet(page, SIGNED_CHROME_VIEWER);
  const panel = await openEndorsementsPanelLoggedOut(page);
  await dismissNextDevOverlay(page);
  await panel
    .getByRole('button', { name: 'Open endorsement from Bob' })
    .click();

  const vouch = page.getByRole('dialog', { name: 'Bob’s vouch for Alice' });
  await expect(vouch).toBeVisible();
  await vouch.getByRole('button', { name: 'Support', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: /^Support endorsement / });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.gesture-sheet-verb')).toHaveText(
    'Support endorsement'
  );
  await expect(sheet.locator('.gesture-sheet-person')).toHaveCount(0);
  await expect(sheet.locator('.gesture-sheet-handle')).toHaveCount(0);
  await expect(sheet.locator('.scarce-buy-party-name')).toHaveText('Alice');
  await expect(sheet.locator('.scarce-buy-party-handle')).toHaveText(
    `@${ENDORSE_E2E_ACCOUNT}`
  );
  await expect(
    sheet.getByRole('textbox', { name: 'Amount in SOCIAL' })
  ).toBeVisible();
  await expect
    .poll(async () => (await sheet.boundingBox())?.y ?? 9999, {
      timeout: 3_000,
    })
    .toBeLessThan(700);
});
