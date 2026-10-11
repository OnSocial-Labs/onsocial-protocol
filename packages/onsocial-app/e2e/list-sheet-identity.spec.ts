import { expect, test } from '@playwright/test';
import { seedE2eWallet } from './helpers/collection-page';
import { SIGNED_CHROME_VIEWER } from './helpers/signed-journey-chrome';
import { dismissNextDevOverlay, gotoApp } from './helpers/navigation';

test('list sheet header is the verb and the author is the body face', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedE2eWallet(page, SIGNED_CHROME_VIEWER);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);

  const list = page.getByRole('button', { name: 'List', exact: true }).first();
  const found = await list
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!found, 'No listable post in this home feed');

  await list.click();
  const sheet = page.getByRole('dialog', { name: /^List / });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.gesture-sheet-verb')).toHaveText('List');
  await expect(sheet.locator('.gesture-sheet-person')).toHaveCount(0);
  await expect(sheet.locator('.gesture-sheet-handle')).toHaveCount(0);
  await expect(sheet.locator('.scarce-buy-party-handle')).toHaveText(
    `@${SIGNED_CHROME_VIEWER}`
  );
});
