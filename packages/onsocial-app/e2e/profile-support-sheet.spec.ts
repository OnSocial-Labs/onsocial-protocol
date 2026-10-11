import { expect, test } from '@playwright/test';
import {
  expectSignedVisitorGestures,
  openSignedVisitorProfile,
} from './helpers/signed-journey-chrome';
import { dismissNextDevOverlay } from './helpers/navigation';

test.describe('profile support sheet', () => {
  test('header is the verb and the person is the body face', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { target } = await openSignedVisitorProfile(page);
    await expectSignedVisitorGestures(page, target);
    await dismissNextDevOverlay(page);
    await page.locator('.portfolio-identity-gesture--support').click();

    const sheet = page.getByRole('dialog', { name: /^Support / });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.gesture-sheet-verb')).toHaveText('Support');
    await expect(sheet.locator('.gesture-sheet-person')).toHaveCount(0);
    await expect(sheet.locator('.gesture-sheet-handle')).toHaveCount(0);

    const face = sheet.locator('.scarce-buy-party');
    await expect(face).toBeVisible();
    await expect(face.locator('.scarce-buy-party-name')).not.toHaveText('');
    await expect(face.locator('.scarce-buy-party-handle')).toHaveText(
      `@${target}`
    );
    await expect(
      sheet.getByRole('textbox', { name: 'Amount in SOCIAL' })
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sheet.locator('.gesture-sheet-verb')).toHaveText('Support');
    await expect(face.locator('.scarce-buy-party-handle')).toHaveText(
      `@${target}`
    );
  });
});
