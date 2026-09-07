import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('dao create voice', () => {
  test('Create DAO sheet asks Connect, not Connect wallet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/daos');

    await page.getByRole('button', { name: 'Create DAO' }).click();

    const sheet = page.getByRole('dialog', { name: /^Create DAO/ });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(
      sheet.getByText('Connect to create a DAO.', { exact: true })
    ).toBeVisible();
    await expect(sheet.getByText('Connect wallet')).toHaveCount(0);
    await expect(
      sheet.getByRole('button', { name: 'Connect', exact: true })
    ).toBeVisible();
  });
});
